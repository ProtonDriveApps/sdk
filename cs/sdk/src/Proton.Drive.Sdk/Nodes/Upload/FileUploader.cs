using Microsoft.Extensions.Logging;
using Proton.Drive.Sdk.Telemetry;
using Proton.Sdk;
using Proton.Sdk.Threading;

namespace Proton.Drive.Sdk.Nodes.Upload;

public sealed partial class FileUploader : IDisposable
{
    private readonly ProtonDriveClient _client;
    private readonly IRevisionDraftProvider _revisionDraftProvider;
    private readonly NodeUid _telemetryContextNodeUid;
    private readonly FileUploadMetadata _metadata;
    private readonly ILogger _logger;

    private volatile int _remainingNumberOfBlocks;

    private FileUploader(
        ProtonDriveClient client,
        IRevisionDraftProvider revisionDraftProvider,
        NodeUid telemetryContextNodeUid,
        long size,
        FileUploadMetadata metadata,
        int expectedNumberOfBlocks,
        ILogger logger)
    {
        _client = client;
        _revisionDraftProvider = revisionDraftProvider;
        _telemetryContextNodeUid = telemetryContextNodeUid;
        FileSize = size;
        _metadata = metadata;
        _remainingNumberOfBlocks = expectedNumberOfBlocks;
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
        ReleaseRemainingBlocks();
    }

    internal static async ValueTask<FileUploader> CreateAsync(
        ProtonDriveClient client,
        IRevisionDraftProvider revisionDraftProvider,
        NodeUid telemetryContextNodeUid,
        long size,
        FileUploadMetadata metadata,
        CancellationToken cancellationToken)
    {
        var logger = client.Telemetry.GetLogger("File uploader");

        var expectedNumberOfBlocks = (int)size.DivideAndRoundUp(RevisionWriter.DefaultBlockSize);

        LogAcquiringRevisionCreationSemaphore(logger, expectedNumberOfBlocks);

        await client.RevisionCreationSemaphore.EnterAsync(expectedNumberOfBlocks, cancellationToken).ConfigureAwait(false);

        LogAcquiredRevisionCreationSemaphore(logger, expectedNumberOfBlocks);

        return new FileUploader(
            client,
            revisionDraftProvider,
            telemetryContextNodeUid,
            size,
            metadata,
            expectedNumberOfBlocks,
            logger);
    }

    [LoggerMessage(Level = LogLevel.Trace, Message = "Trying to acquire {Count} from revision creation semaphore")]
    private static partial void LogAcquiringRevisionCreationSemaphore(ILogger logger, int count);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Acquired {Count} from revision creation semaphore")]
    private static partial void LogAcquiredRevisionCreationSemaphore(ILogger logger, int count);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Released {Count} from revision creation semaphore")]
    private static partial void LogReleasedRevisionCreationSemaphore(ILogger logger, int count);

    private UploadController UploadFromStream(
        Stream contentStream,
        bool ownsContentStream,
        IEnumerable<Thumbnail> thumbnails,
        Action<long, long>? onProgress,
        Func<ReadOnlyMemory<byte>>? expectedSha1Provider,
        CancellationToken cancellationToken)
    {
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
            uploadFunction.Invoke(taskControl.PauseOrCancellationToken),
            uploadFunction,
            ownsContentStream ? contentStream : null,
            taskControl,
            OnFailedAsync,
            OnSucceededAsync);

        async ValueTask OnFailedAsync(Exception ex, long uploadedByteCount)
        {
            if (ex is NodeWithSameNameExistsException)
            {
                return;
            }

            var uploadEvent = await TelemetryEventFactory.CreateUploadEventAsync(_client, _telemetryContextNodeUid, contentStream.Length, cancellationToken)
                .ConfigureAwait(false);

            uploadEvent.UploadedSize = uploadedByteCount;
            uploadEvent.ApproximateUploadedSize = Privacy.ReduceSizePrecision(uploadedByteCount);
            uploadEvent.Error = TelemetryErrorResolver.GetUploadErrorFromException(ex);
            uploadEvent.OriginalError = ex;

            RaiseTelemetryEvent(uploadEvent);
        }

        async ValueTask OnSucceededAsync(long uploadedByteCount)
        {
            var uploadEvent = await TelemetryEventFactory.CreateUploadEventAsync(_client, _telemetryContextNodeUid, contentStream.Length, cancellationToken)
                .ConfigureAwait(false);

            uploadEvent.UploadedSize = uploadedByteCount;
            uploadEvent.ApproximateUploadedSize = Privacy.ReduceSizePrecision(uploadedByteCount);

            RaiseTelemetryEvent(uploadEvent);
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
        var revisionDraft = revisionDraftTaskCompletionSource.Task.GetResultIfCompletedSuccessfully();
        if (revisionDraft is null)
        {
            revisionDraft = await _revisionDraftProvider.GetDraftAsync(cancellationToken).ConfigureAwait(false);
            revisionDraftTaskCompletionSource.SetResult(revisionDraft);
        }

        await UploadAsync(
            revisionDraft,
            contentStream,
            thumbnails,
            onProgress,
            expectedSha1,
            cancellationToken).ConfigureAwait(false);

        await UpdateActiveRevisionInCacheAsync(revisionDraft.Uid, contentStream.Length, cancellationToken).ConfigureAwait(false);

        return new UploadResult(revisionDraft.Uid.NodeUid, revisionDraft.Uid);
    }

    private async ValueTask UpdateActiveRevisionInCacheAsync(RevisionUid revisionUid, long size, CancellationToken cancellationToken)
    {
        var cachedNodeInfo = await _client.Cache.Entities.TryGetNodeAsync(revisionUid.NodeUid, cancellationToken).ConfigureAwait(false);

        if (cachedNodeInfo is not var (nodeProvisionResult, membershipShareId, nameHashDigest) || !nodeProvisionResult.TryGetValue(out var node) ||
            node is not FileNode fileNode)
        {
            await _client.Cache.Entities.RemoveNodeAsync(revisionUid.NodeUid, cancellationToken).ConfigureAwait(false);
            return;
        }

        fileNode = fileNode with
        {
            ActiveRevision = fileNode.ActiveRevision with
            {
                Uid = revisionUid,
                ClaimedSize = size,
                ClaimedModificationTime = _metadata.LastModificationTime?.UtcDateTime,

                // FIXME: update remaining metadata in cache, but this is not critical because this metadata will soon be invalidated by the event anyway
            },
        };

        await _client.Cache.Entities.SetNodeAsync(fileNode.Uid, fileNode, membershipShareId, nameHashDigest, cancellationToken).ConfigureAwait(false);
    }

    private async ValueTask UploadAsync(
        RevisionDraft revisionDraft,
        Stream contentStream,
        IEnumerable<Thumbnail> thumbnails,
        Action<long>? onProgress,
        Lazy<ReadOnlyMemory<byte>>? expectedSha1,
        CancellationToken cancellationToken)
    {
        using var revisionWriter = await RevisionOperations.OpenForWritingAsync(_client, revisionDraft, ReleaseBlocks, cancellationToken).ConfigureAwait(false);

        await revisionWriter.WriteAsync(
            contentStream,
            FileSize,
            expectedSha1,
            thumbnails,
            _metadata,
            onProgress,
            cancellationToken).ConfigureAwait(false);
    }

    private void ReleaseBlocks(int numberOfBlocks)
    {
        var newRemainingNumberOfBlocks = Interlocked.Add(ref _remainingNumberOfBlocks, -numberOfBlocks);

        var amountToRelease = Math.Max(newRemainingNumberOfBlocks >= 0 ? numberOfBlocks : newRemainingNumberOfBlocks + numberOfBlocks, 0);

        _client.RevisionCreationSemaphore.Release(amountToRelease);

        LogReleasedRevisionCreationSemaphore(_logger, amountToRelease);
    }

    private void ReleaseRemainingBlocks()
    {
        if (_remainingNumberOfBlocks <= 0)
        {
            return;
        }

        _client.RevisionCreationSemaphore.Release(_remainingNumberOfBlocks);

        LogReleasedRevisionCreationSemaphore(_logger, _remainingNumberOfBlocks);

        _remainingNumberOfBlocks = 0;
    }

    private void RaiseTelemetryEvent(UploadEvent uploadEvent)
    {
        try
        {
            _client.Telemetry.RecordMetric(uploadEvent);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to record metric for upload event");
        }
    }
}
