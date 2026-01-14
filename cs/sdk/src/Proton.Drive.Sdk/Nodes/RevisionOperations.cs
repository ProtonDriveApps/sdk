using Proton.Drive.Sdk.Nodes.Download;
using Proton.Drive.Sdk.Nodes.Upload;

namespace Proton.Drive.Sdk.Nodes;

internal static class RevisionOperations
{
    public static async ValueTask<RevisionWriter> OpenForWritingAsync(
        ProtonDriveClient client,
        RevisionDraft draft,
        Action<int> releaseBlocksAction,
        CancellationToken cancellationToken)
    {
        await client.BlockUploader.Queue.StartFileAsync(cancellationToken).ConfigureAwait(false);

        return new RevisionWriter(
            client,
            draft,
            releaseBlocksAction,
            () => client.BlockUploader.Queue.FinishFile(),
            client.TargetBlockSize);
    }

    internal static async ValueTask<RevisionReader> OpenForReadingAsync(
        ProtonDriveClient client,
        RevisionUid revisionUid,
        Action<int> releaseBlockListingAction,
        CancellationToken cancellationToken)
    {
        var fileSecretsResult = await FileOperations.GetSecretsAsync(client, revisionUid.NodeUid, cancellationToken).ConfigureAwait(false);

        var (key, contentKey) = fileSecretsResult.TryGetValueElseError(out var fileSecrets, out var degradedFileSecrets)
            ? (fileSecrets.Key, fileSecrets.ContentKey)
            : (degradedFileSecrets.Key ?? throw new InvalidOperationException($"Node key not available for file {revisionUid.NodeUid}"),
               degradedFileSecrets.ContentKey ?? throw new InvalidOperationException($"Content key not available for file {revisionUid.NodeUid}"));

        var (fileUid, revisionId) = revisionUid;

        var revisionResponse = await client.Api.Files.GetRevisionAsync(
            fileUid.VolumeId,
            fileUid.LinkId,
            revisionId,
            RevisionReader.MinBlockIndex,
            RevisionReader.DefaultBlockPageSize,
            withoutBlockUrls: false,
            cancellationToken).ConfigureAwait(false);

        await client.BlockDownloader.Queue.StartFileAsync(cancellationToken).ConfigureAwait(false);

        return new RevisionReader(
            client,
            revisionUid,
            key,
            contentKey,
            revisionResponse.Revision,
            releaseBlockListingAction,
            () => client.BlockDownloader.Queue.FinishFile());
    }
}
