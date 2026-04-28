using Microsoft.Extensions.Logging;
using Proton.Drive.Sdk.Telemetry;
using Proton.Sdk;
using Proton.Sdk.Threading;

namespace Proton.Drive.Sdk.Nodes.Upload;

public sealed class FileUploader : IDisposable
{
    private readonly ProtonDriveClient _client;
    private readonly long _queueToken;
    private readonly IRevisionDraftProvider _revisionDraftProvider;
    private readonly NodeUid _telemetryContextNodeUid;
    private readonly FileUploadMetadata _metadata;
    private readonly ILogger _logger;

    private bool _isDisposed;

    private FileUploader(
        ProtonDriveClient client,
        long queueToken,
        IRevisionDraftProvider revisionDraftProvider,
        NodeUid telemetryContextNodeUid,
        long size,
        FileUploadMetadata metadata,
        ILogger logger)
    {
        _client = client;
        _queueToken = queueToken;
        _revisionDraftProvider = revisionDraftProvider;
        _telemetryContextNodeUid = telemetryContextNodeUid;
        FileSize = size;
        _metadata = metadata;
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
        IRevisionDraftProvider revisionDraftProvider,
        NodeUid telemetryContextNodeUid,
        long size,
        FileUploadMetadata metadata)
    {
        var expectedNumberOfBlocks = (int)size.DivideAndRoundUp(RevisionWriter.DefaultBlockSize);

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
            client.Telemetry.GetLogger("File uploader"));
    }

    internal static async ValueTask<FileUploader> CreateAsync(
        ProtonDriveClient client,
        IRevisionDraftProvider revisionDraftProvider,
        NodeUid telemetryContextNodeUid,
        long size,
        FileUploadMetadata metadata,
        CancellationToken cancellationToken)
    {
        var expectedNumberOfBlocks = (int)size.DivideAndRoundUp(RevisionWriter.DefaultBlockSize);

        var queueToken = await client.UploadQueue.EnqueueFileAsync(expectedNumberOfBlocks, cancellationToken).ConfigureAwait(false);

        return new FileUploader(
            client,
            queueToken,
            revisionDraftProvider,
            telemetryContextNodeUid,
            size,
            metadata,
            client.Telemetry.GetLogger("File uploader"));
    }

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
        var revisionWriter = RevisionOperations.OpenForWriting(_client, revisionDraft, _queueToken);

        await revisionWriter.WriteAsync(
            contentStream,
            FileSize,
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
            _logger.LogWarning(ex, "Failed to record metric for upload event");
        }
    }
}
