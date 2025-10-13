using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes.Upload;

public sealed class FileUploader : IDisposable
{
    private readonly ProtonDriveClient _client;
    private readonly IFileDraftProvider _fileDraftProvider;
    private readonly DateTimeOffset? _lastModificationTime;
    private volatile int _remainingNumberOfBlocks;

    internal FileUploader(
        ProtonDriveClient client,
        IFileDraftProvider fileDraftProvider,
        long size,
        DateTimeOffset? lastModificationTime,
        int expectedNumberOfBlocks)
    {
        _client = client;
        _fileDraftProvider = fileDraftProvider;
        FileSize = size;
        _lastModificationTime = lastModificationTime;
        _remainingNumberOfBlocks = expectedNumberOfBlocks;
    }

    internal long FileSize { get; }

    public UploadController UploadFromStream(
        Stream contentStream,
        IEnumerable<Thumbnail> thumbnails,
        Action<long, long> onProgress,
        CancellationToken cancellationToken)
    {
        var task = UploadFromStreamAsync(contentStream, thumbnails, onProgress, cancellationToken);

        return new UploadController(task);
    }

    public UploadController UploadFromFile(
        string filePath,
        IEnumerable<Thumbnail> thumbnails,
        Action<long, long> onProgress,
        CancellationToken cancellationToken)
    {
        var task = UploadFromFileAsync(filePath, thumbnails, onProgress, cancellationToken);

        return new UploadController(task);
    }

    public void Dispose()
    {
        if (_remainingNumberOfBlocks <= 0)
        {
            return;
        }

        _client.RevisionCreationSemaphore.Release(_remainingNumberOfBlocks);
        _remainingNumberOfBlocks = 0;
    }

    private async Task<(NodeUid NodeUid, RevisionUid RevisionUid)> UploadFromStreamAsync(
        Stream contentStream,
        IEnumerable<Thumbnail> thumbnails,
        Action<long, long> onProgress,
        CancellationToken cancellationToken)
    {
        var (draftRevisionUid, fileSecrets) = await _fileDraftProvider.GetDraftAsync(_client, cancellationToken).ConfigureAwait(false);

        await UploadAsync(
            draftRevisionUid,
            fileSecrets,
            contentStream,
            thumbnails,
            _lastModificationTime,
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
        Action<long, long> onProgress,
        CancellationToken cancellationToken)
    {
        var contentStream = File.Open(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);

        await using (contentStream.ConfigureAwait(false))
        {
            return await UploadFromStreamAsync(contentStream, thumbnails, onProgress, cancellationToken).ConfigureAwait(false);
        }
    }

    private async ValueTask UploadAsync(
        RevisionUid revisionUid,
        FileSecrets fileSecrets,
        Stream contentStream,
        IEnumerable<Thumbnail> thumbnails,
        DateTimeOffset? lastModificationTime,
        Action<long, long> onProgress,
        CancellationToken cancellationToken)
    {
        using var revisionWriter = await RevisionOperations.OpenForWritingAsync(_client, revisionUid, fileSecrets, ReleaseBlocks, cancellationToken)
            .ConfigureAwait(false);

        await revisionWriter.WriteAsync(contentStream, thumbnails, lastModificationTime, onProgress, cancellationToken).ConfigureAwait(false);
    }

    private void ReleaseBlocks(int numberOfBlocks)
    {
        var newRemainingNumberOfBlocks = Interlocked.Add(ref _remainingNumberOfBlocks, -numberOfBlocks);

        var amountToRelease = Math.Max(newRemainingNumberOfBlocks >= 0 ? numberOfBlocks : newRemainingNumberOfBlocks + numberOfBlocks, 0);

        _client.RevisionCreationSemaphore.Release(amountToRelease);
    }
}
