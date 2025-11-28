using Microsoft.Extensions.Logging;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes.Upload;

public sealed partial class FileUploader : IDisposable
{
    private readonly ProtonDriveClient _client;
    private readonly IFileDraftProvider _fileDraftProvider;
    private readonly DateTimeOffset? _lastModificationTime;
    private readonly IEnumerable<AdditionalMetadataProperty>? _additionalMetadata;
    private readonly ILogger _logger;

    private volatile int _remainingNumberOfBlocks;

    private FileUploader(
        ProtonDriveClient client,
        IFileDraftProvider fileDraftProvider,
        long size,
        DateTimeOffset? lastModificationTime,
        IEnumerable<AdditionalMetadataProperty>? additionalMetadata,
        int expectedNumberOfBlocks,
        ILogger logger)
    {
        _client = client;
        _fileDraftProvider = fileDraftProvider;
        FileSize = size;
        _lastModificationTime = lastModificationTime;
        _additionalMetadata = additionalMetadata;
        _remainingNumberOfBlocks = expectedNumberOfBlocks;
        _logger = logger;
    }

    internal long FileSize { get; }

    public UploadController UploadFromStream(
        Stream contentStream,
        IEnumerable<Thumbnail> thumbnails,
        Action<long, long>? onProgress,
        CancellationToken cancellationToken)
    {
        var task = UploadFromStreamAsync(contentStream, thumbnails, _additionalMetadata, progress => onProgress?.Invoke(progress, FileSize), cancellationToken);

        return new UploadController(task);
    }

    public UploadController UploadFromFile(
        string filePath,
        IEnumerable<Thumbnail> thumbnails,
        Action<long, long>? onProgress,
        CancellationToken cancellationToken)
    {
        var task = UploadFromFileAsync(filePath, thumbnails, _additionalMetadata, progress => onProgress?.Invoke(progress, FileSize), cancellationToken);

        return new UploadController(task);
    }

    public void Dispose()
    {
        ReleaseRemainingBlocks();
    }

    internal static async ValueTask<FileUploader> CreateAsync(
        ProtonDriveClient client,
        IFileDraftProvider fileDraftProvider,
        long size,
        DateTime? lastModificationTime,
        IEnumerable<AdditionalMetadataProperty>? additionalExtendedAttributes,
        CancellationToken cancellationToken)
    {
        var logger = client.Telemetry.GetLogger("File uploader");

        var expectedNumberOfBlocks = (int)size.DivideAndRoundUp(RevisionWriter.DefaultBlockSize);

        LogAcquiringRevisionCreationSemaphore(logger, expectedNumberOfBlocks);

        await client.RevisionCreationSemaphore.EnterAsync(expectedNumberOfBlocks, cancellationToken).ConfigureAwait(false);

        LogAcquiredRevisionCreationSemaphore(logger, expectedNumberOfBlocks);

        return new FileUploader(client, fileDraftProvider, size, lastModificationTime, additionalExtendedAttributes, expectedNumberOfBlocks, logger);
    }

    [LoggerMessage(Level = LogLevel.Trace, Message = "Trying to acquire {Count} from revision creation semaphore")]
    private static partial void LogAcquiringRevisionCreationSemaphore(ILogger logger, int count);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Acquired {Count} from revision creation semaphore")]
    private static partial void LogAcquiredRevisionCreationSemaphore(ILogger logger, int count);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Released {Count} from revision creation semaphore")]
    private static partial void LogReleasedRevisionCreationSemaphore(ILogger logger, int count);

    [LoggerMessage(Level = LogLevel.Error, Message = "Draft deletion failed for revision {RevisionUid}")]
    private static partial void LogDraftDeletionFailure(ILogger logger, Exception exception, RevisionUid revisionUid);

    private async Task<(NodeUid NodeUid, RevisionUid RevisionUid)> UploadFromStreamAsync(
        Stream contentStream,
        IEnumerable<Thumbnail> thumbnails,
        IEnumerable<AdditionalMetadataProperty>? additionalExtendedAttributes,
        Action<long>? onProgress,
        CancellationToken cancellationToken)
    {
        var (draftRevisionUid, fileSecrets) = await _fileDraftProvider.GetDraftAsync(_client, cancellationToken).ConfigureAwait(false);

        await UploadAsync(
            draftRevisionUid,
            fileSecrets,
            contentStream,
            thumbnails,
            _lastModificationTime,
            additionalExtendedAttributes,
            onProgress,
            cancellationToken).ConfigureAwait(false);

        await UpdateActiveRevisionInCacheAsync(draftRevisionUid, contentStream.Length, cancellationToken).ConfigureAwait(false);

        return (draftRevisionUid.NodeUid, draftRevisionUid);
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
                ClaimedModificationTime = _lastModificationTime?.UtcDateTime,

                // FIXME: update remaining metadata in cache, but this is not critical because this metadata will soon be invalidated by the event anyway
            },
        };

        await _client.Cache.Entities.SetNodeAsync(fileNode.Uid, fileNode, membershipShareId, nameHashDigest, cancellationToken).ConfigureAwait(false);
    }

    private async Task<(NodeUid NodeUid, RevisionUid RevisionUid)> UploadFromFileAsync(
        string filePath,
        IEnumerable<Thumbnail> thumbnails,
        IEnumerable<AdditionalMetadataProperty>? additionalMetadata,
        Action<long>? onProgress,
        CancellationToken cancellationToken)
    {
        var contentStream = File.Open(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);

        await using (contentStream.ConfigureAwait(false))
        {
            return await UploadFromStreamAsync(contentStream, thumbnails, additionalMetadata, onProgress, cancellationToken).ConfigureAwait(false);
        }
    }

    private async ValueTask UploadAsync(
        RevisionUid revisionUid,
        FileSecrets fileSecrets,
        Stream contentStream,
        IEnumerable<Thumbnail> thumbnails,
        DateTimeOffset? lastModificationTime,
        IEnumerable<AdditionalMetadataProperty>? additionalMetadata,
        Action<long>? onProgress,
        CancellationToken cancellationToken)
    {
        using var revisionWriter = await RevisionOperations.OpenForWritingAsync(_client, revisionUid, fileSecrets, ReleaseBlocks, cancellationToken)
            .ConfigureAwait(false);

        try
        {
            await revisionWriter.WriteAsync(contentStream, FileSize, thumbnails, lastModificationTime, additionalMetadata, onProgress, cancellationToken).ConfigureAwait(false);
        }
        catch
        {
            try
            {
                await _fileDraftProvider.DeleteDraftAsync(_client, revisionUid, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                LogDraftDeletionFailure(_client.Telemetry.GetLogger("Upload"), ex, revisionUid);
            }

            throw;
        }
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
}
