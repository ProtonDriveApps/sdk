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

        var fileNode = await UploadAsync(
            draftRevisionUid,
            fileSecrets,
            contentStream,
            thumbnails,
            _lastModificationTime,
            onProgress,
            cancellationToken).ConfigureAwait(false);

        return (fileNode.Uid, fileNode.ActiveRevision.Uid);
    }

    private async ValueTask<FileNode> UploadAsync(
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

        var nodeMetadata = await NodeOperations.GetNodeMetadataAsync(_client, revisionUid.NodeUid, cancellationToken).ConfigureAwait(false);

        return (FileNode)nodeMetadata.Node;
    }

    private void ReleaseBlocks(int numberOfBlocks)
    {
        var newRemainingNumberOfBlocks = Interlocked.Add(ref _remainingNumberOfBlocks, -numberOfBlocks);

        var amountToRelease = Math.Max(newRemainingNumberOfBlocks >= 0 ? numberOfBlocks : newRemainingNumberOfBlocks + numberOfBlocks, 0);

        _client.RevisionCreationSemaphore.Release(amountToRelease);
    }
}
