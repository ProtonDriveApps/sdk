using System.Net;
using Microsoft.Extensions.Logging;
using Proton.Drive.Sdk.Telemetry;
using Proton.Drive.Sdk.Threading;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Nodes.Upload;

public sealed partial class FileUploader : IDisposable
{
    private readonly ProtonDriveClient _client;
    private readonly long _queueToken;
    private readonly IRevisionDraftProvider _revisionDraftProvider;
    private readonly NodeUid _telemetryContextNodeUid;
    private readonly FileUploadMetadata _metadata;
    private readonly long _requestTimestamp;
    private readonly ILogger _logger;

    private bool _isDisposed;

    private FileUploader(
        ProtonDriveClient client,
        long queueToken,
        IRevisionDraftProvider revisionDraftProvider,
        NodeUid telemetryContextNodeUid,
        long size,
        FileUploadMetadata metadata,
        long requestTimestamp,
        ILogger logger)
    {
        _client = client;
        _queueToken = queueToken;
        _revisionDraftProvider = revisionDraftProvider;
        _telemetryContextNodeUid = telemetryContextNodeUid;
        FileSize = size;
        _metadata = metadata;
        _requestTimestamp = requestTimestamp;
        _logger = logger;
    }

    internal long FileSize { get; }

    public UploadController UploadFromStream(
        Stream contentStream,
        IEnumerable<Thumbnail> thumbnails,
        Action<long, long>? onProgress,
        Func<ReadOnlyMemory<byte>>? expectedSha1Provider,
        CancellationToken cancellationToken)
    {
        return UploadFromStream(
            contentStream,
            ownsContentStream: false,
            thumbnails,
            onProgress,
            expectedSha1Provider,
            cancellationToken);
    }

    public UploadController UploadFromFile(
        string filePath,
        IEnumerable<Thumbnail> thumbnails,
        Action<long, long>? onProgress,
        Func<ReadOnlyMemory<byte>>? expectedSha1Provider,
        CancellationToken cancellationToken)
    {
        var contentStream = File.Open(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);

        return UploadFromStream(
            contentStream,
            ownsContentStream: true,
            thumbnails,
            onProgress,
            expectedSha1Provider,
            cancellationToken);
    }

    public void Dispose()
    {
        if (_isDisposed)
        {
            return;
        }

        try
        {
            _client.UploadQueue.RemoveFileFromQueue(_queueToken);
        }
        finally
        {
            _isDisposed = true;
        }
    }

    internal static FileUploader? TryCreate(
        ProtonDriveClient client,
        long requestTimestamp,
        IRevisionDraftProvider revisionDraftProvider,
        NodeUid telemetryContextNodeUid,
        long size,
        FileUploadMetadata metadata)
    {
        var expectedNumberOfBlocks = (int)size.DivideAndRoundUp(client.TargetBlockSize);

        if (client.UploadQueue.TryEnqueueFile(expectedNumberOfBlocks) is not { } queueToken)
        {
            return null;
        }

        return new FileUploader(
            client,
            queueToken,
            revisionDraftProvider,
            telemetryContextNodeUid,
            size,
            metadata,
            requestTimestamp,
            client.Telemetry.GetLogger("File uploader"));
    }

    internal static async ValueTask<FileUploader> CreateAsync(
        ProtonDriveClient client,
        long requestTimestamp,
        IRevisionDraftProvider revisionDraftProvider,
        NodeUid telemetryContextNodeUid,
        long size,
        FileUploadMetadata metadata,
        CancellationToken cancellationToken)
    {
        var logger = client.Telemetry.GetLogger("File uploader");

        var expectedNumberOfBlocks = (int)size.DivideAndRoundUp(client.TargetBlockSize);

        var queueToken = await client.UploadQueue.EnqueueFileAsync(expectedNumberOfBlocks, cancellationToken).ConfigureAwait(false);

        return new FileUploader(
            client,
            queueToken,
            revisionDraftProvider,
            telemetryContextNodeUid,
            size,
            metadata,
            requestTimestamp,
            logger);
    }

    internal static ValueTask<FileUploader> CreateAsync(
        ProtonDriveClient client,
        IRevisionDraftProvider revisionDraftProvider,
        NodeUid telemetryContextNodeUid,
        long size,
        FileUploadMetadata metadata,
        CancellationToken cancellationToken)
    {
        return CreateAsync(
            client,
            client.TimeProvider.GetTimestamp(),
            revisionDraftProvider,
            telemetryContextNodeUid,
            size,
            metadata,
            cancellationToken);
    }

    // Only fall back when no server write could have happened: SmallUploadNotApplicableException is raised before the upload
    // POST, a 429 is rejected before processing, and an AlreadyExists conflict is a clean rejection (the server committed
    // nothing). Ambiguous post-POST failures (5xx / 424 / dropped connections) are NOT retried, because the small upload
    // creates and commits the revision atomically and is not idempotent — re-running it could duplicate state or report
    // failure after the server already succeeded.
    //
    // The conflict cases fall back so the regular path can recover: its draft creation deletes a stale own-draft left by a
    // prior interrupted upload and retries, or re-surfaces NodeWithSameNameExistsException for a genuine name collision. The
    // small-upload endpoint creates no draft, so it cannot perform that cleanup itself.
    private static bool IsSmallUploadFallbackException(Exception ex) =>
        ex switch
        {
            SmallUploadNotApplicableException => true,
            TooManyRequestsException => true,
            NodeWithSameNameExistsException => true,
            RevisionDraftConflictException => true,
            _ => false,
        };

    private static int? GetTransportStatusCode(Exception ex) =>
        ex switch
        {
            HttpRequestException http => (int?)http.StatusCode,
            TooManyRequestsException => (int)HttpStatusCode.TooManyRequests,
            ProtonApiException api => api.TransportCode,
            _ => null,
        };

    [LoggerMessage(
        Level = LogLevel.Warning,
        Message = "Small file upload failed transiently (status: {StatusCode}); falling back to regular upload (~{ApproximateSize} bytes)")]
    private static partial void LogSmallUploadFallback(ILogger logger, int? statusCode, long approximateSize);

    [LoggerMessage(
        Level = LogLevel.Warning,
        Message = "Failed to record metric for upload event")]
    private static partial void LogUploadEventRecordingFailure(ILogger logger, Exception exception);

    [LoggerMessage(
        Level = LogLevel.Warning,
        Message = "Failed to record metrics for upload performance")]
    private static partial void LogUploadPerformanceRecordingFailure(ILogger logger, Exception exception);

    private UploadController UploadFromStream(
        Stream contentStream,
        bool ownsContentStream,
        IEnumerable<Thumbnail> thumbnails,
        Action<long, long>? onProgress,
        Func<ReadOnlyMemory<byte>>? expectedSha1Provider,
        CancellationToken cancellationToken)
    {
        // Active time is measured from here, so it covers the whole upload but not the wait for a transfer queue
        // slot, which happens before the uploader is created.
        var startTimestamp = _client.TimeProvider.GetTimestamp();

        var taskControl = new TaskControl(cancellationToken);

        var revisionDraftTaskCompletionSource = new TaskCompletionSource<RevisionDraft>();

        var expectedSha1 = expectedSha1Provider is not null ? new Lazy<ReadOnlyMemory<byte>>(expectedSha1Provider) : null;

        var uploadFunction = (CancellationToken ct) => UploadFromStreamAsync(
            contentStream,
            thumbnails,
            progress => onProgress?.Invoke(progress, FileSize),
            expectedSha1,
            revisionDraftTaskCompletionSource,
            ct);

        return new UploadController(
            revisionDraftTaskCompletionSource.Task,
            uploadFunction(taskControl.PauseOrCancellationToken),
            uploadFunction,
            ownsContentStream ? contentStream : null,
            taskControl,
            startTimestamp,
            _client.TimeProvider,
            OnFailedAsync,
            OnSucceededAsync,
            FileSize);

        async ValueTask OnFailedAsync(Exception ex, long uploadedByteCount)
        {
            var uploadEvent = await TelemetryEventFactory.CreateUploadEventAsync(_client, _telemetryContextNodeUid, contentStream.Length, cancellationToken)
                .ConfigureAwait(false);

            uploadEvent.UploadedSize = uploadedByteCount;
            uploadEvent.ApproximateUploadedSize = Privacy.ReduceSizePrecision(uploadedByteCount);
            uploadEvent.Error = TelemetryErrorResolver.GetUploadErrorFromException(ex);
            uploadEvent.OriginalError = ex;

            RaiseTelemetryEvent(uploadEvent);
        }

        async ValueTask OnSucceededAsync(UploadMetricsContext metricsContext)
        {
            // Read before the upload event is built below: that resolves the volume type, which can hit the API,
            // and would otherwise be measured as part of the upload.
            var elapsedSinceRequest = _client.TimeProvider.GetElapsedTime(_requestTimestamp);

            var uploadEvent = await TelemetryEventFactory.CreateUploadEventAsync(_client, _telemetryContextNodeUid, contentStream.Length, cancellationToken)
                .ConfigureAwait(false);

            uploadEvent.UploadedSize = metricsContext.UploadedByteCount;
            uploadEvent.ApproximateUploadedSize = Privacy.ReduceSizePrecision(metricsContext.UploadedByteCount);

            RaiseTelemetryEvent(uploadEvent);

            RaiseUploadPerformanceEvents(metricsContext, elapsedSinceRequest, cancellationToken);
        }
    }

    private async Task<UploadResult> UploadFromStreamAsync(
        Stream contentStream,
        IEnumerable<Thumbnail> thumbnails,
        Action<long>? onProgress,
        Lazy<ReadOnlyMemory<byte>>? expectedSha1,
        TaskCompletionSource<RevisionDraft> revisionDraftTaskCompletionSource,
        CancellationToken cancellationToken)
    {
        var thumbnailList = thumbnails as IReadOnlyList<Thumbnail> ?? thumbnails.ToList();

        var revisionDraft = revisionDraftTaskCompletionSource.Task.GetResultIfCompletedSuccessfully();
        if (revisionDraft is not null)
        {
            return await CompleteUploadAsync(revisionDraft, contentStream, thumbnailList, onProgress, expectedSha1, cancellationToken)
                .ConfigureAwait(false);
        }

        revisionDraft = await _revisionDraftProvider.GetDraftAsync(
            FileSize,
            thumbnailList,
            contentStream.CanSeek,
            allowSmallUpload: _metadata is not PhotosFileUploadMetadata,
            cancellationToken).ConfigureAwait(false);

        if (revisionDraft.IsSmallUpload)
        {
            var smallDraft = revisionDraft;

            // Until it commits, the small draft is not published to the completion source, so UploadController cannot
            // own its disposal. Dispose it here unless ownership is handed off to the controller on success.
            var handedOffToController = false;
            try
            {
                var smallUploadResult = await CompleteUploadAsync(
                    smallDraft,
                    contentStream,
                    thumbnailList,
                    onProgress,
                    expectedSha1,
                    cancellationToken).ConfigureAwait(false);

                revisionDraftTaskCompletionSource.SetResult(smallDraft);
                handedOffToController = true;

                return smallUploadResult;
            }
            catch (Exception ex) when (IsSmallUploadFallbackException(ex))
            {
                LogSmallUploadFallback(_logger, GetTransportStatusCode(ex), Privacy.ReduceSizePrecision(FileSize));

                contentStream.Seek(0, SeekOrigin.Begin);

                revisionDraft = await _revisionDraftProvider.GetDraftAsync(
                    FileSize,
                    thumbnailList,
                    contentStream.CanSeek,
                    allowSmallUpload: false,
                    cancellationToken).ConfigureAwait(false);
            }
            finally
            {
                if (!handedOffToController)
                {
                    await smallDraft.DisposeAsync().ConfigureAwait(false);
                }
            }
        }

        revisionDraftTaskCompletionSource.SetResult(revisionDraft);

        return await CompleteUploadAsync(revisionDraft, contentStream, thumbnailList, onProgress, expectedSha1, cancellationToken)
            .ConfigureAwait(false);
    }

    private async Task<UploadResult> CompleteUploadAsync(
        RevisionDraft revisionDraft,
        Stream contentStream,
        IReadOnlyList<Thumbnail> thumbnailList,
        Action<long>? onProgress,
        Lazy<ReadOnlyMemory<byte>>? expectedSha1,
        CancellationToken cancellationToken)
    {
        return await UploadAsync(
            revisionDraft,
            contentStream,
            thumbnailList,
            onProgress,
            expectedSha1,
            cancellationToken).ConfigureAwait(false);
    }

    private async ValueTask<UploadResult> UploadAsync(
        RevisionDraft revisionDraft,
        Stream contentStream,
        IEnumerable<Thumbnail> thumbnails,
        Action<long>? onProgress,
        Lazy<ReadOnlyMemory<byte>>? expectedSha1,
        CancellationToken cancellationToken)
    {
        var revisionWriter = RevisionOperations.OpenForWriting(_client, revisionDraft, _queueToken);

        return await revisionWriter.WriteAsync(
            contentStream,
            expectedSha1,
            thumbnails,
            _metadata,
            onProgress,
            cancellationToken).ConfigureAwait(false);
    }

    private void RaiseTelemetryEvent(UploadEvent uploadEvent)
    {
        try
        {
            _client.Telemetry.RecordMetric(uploadEvent);
        }
        catch (Exception ex)
        {
            LogUploadEventRecordingFailure(_logger, ex);
        }
    }

    private void RaiseUploadPerformanceEvents(
        UploadMetricsContext metricsContext,
        TimeSpan elapsedSinceRequest,
        CancellationToken cancellationToken)
    {
        // The metrics cover uploads that completed and were not cancelled at this measurement point: a cancellation
        // racing the final commit is not an upload the user perceives as done.
        if (cancellationToken.IsCancellationRequested || metricsContext.Statistics is null)
        {
            return;
        }

        try
        {
            // Total time spans from the moment the SDK learned of the upload, including the wait for a
            // transfer-queue slot but excluding time spent paused (a pause reflects a user action or an error
            // awaiting the user). Same monotonic clock as active time, anchored earlier and read later, so
            // active <= total holds by construction even after the subtraction.
            var totalTime = elapsedSinceRequest - metricsContext.PausedTime;

            foreach (var performanceEvent in UploadPerformanceEventFactory.Create(metricsContext, totalTime))
            {
                _client.Telemetry.RecordMetric(performanceEvent);
            }
        }
        catch (Exception ex)
        {
            LogUploadPerformanceRecordingFailure(_logger, ex);
        }
    }
}
