using Proton.Drive.Sdk.Api.Files;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes.Upload;

public sealed class FileUploader : IDisposable
{
    private readonly ProtonDriveClient _client;
    private readonly string _name;
    private readonly string _mediaType;
    private readonly DateTimeOffset? _lastModificationTime;

    private volatile int _remainingNumberOfBlocks;

    internal FileUploader(
        ProtonDriveClient client,
        string name,
        string mediaType,
        DateTimeOffset? lastModificationTime,
        int expectedNumberOfBlocks)
    {
        _client = client;
        _name = name;
        _mediaType = mediaType;
        _lastModificationTime = lastModificationTime;
        _remainingNumberOfBlocks = expectedNumberOfBlocks;
    }

    public UploadController UploadFromStream(
        NodeUid parentFolderUid,
        Stream contentStream,
        IEnumerable<Thumbnail> thumbnails,
        bool createNewRevisionIfExists,
        Action<long, long> onProgress,
        CancellationToken cancellationToken)
    {
        var task = UploadFromStreamAsync(parentFolderUid, contentStream, thumbnails, createNewRevisionIfExists, onProgress, cancellationToken);

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

    private async Task UploadFromStreamAsync(
        NodeUid parentFolderUid,
        Stream contentStream,
        IEnumerable<Thumbnail> thumbnails,
        bool createNewRevisionIfExists,
        Action<long, long> onProgress,
        CancellationToken cancellationToken)
    {
        RevisionUid draftRevisionUid;
        FileSecrets fileSecrets;
        try
        {
            (draftRevisionUid, fileSecrets) = await FileOperations.CreateOrGetExistingDraftAsync(_client, parentFolderUid, _name, _mediaType, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (ProtonApiException<RevisionConflictResponse> ex)
            when (createNewRevisionIfExists && ex.Response is { Conflict: { LinkId: not null, RevisionId: not null, DraftRevisionId: null } })
        {
            throw new NotImplementedException("Uploading new revision not yet implemented");
        }

        await UploadAsync(
            draftRevisionUid,
            fileSecrets,
            contentStream,
            thumbnails,
            _lastModificationTime,
            onProgress,
            cancellationToken).ConfigureAwait(false);
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
