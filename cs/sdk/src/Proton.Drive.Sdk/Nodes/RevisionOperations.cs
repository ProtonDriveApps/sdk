using Proton.Drive.Sdk.Nodes.Download;
using Proton.Drive.Sdk.Nodes.Upload;

namespace Proton.Drive.Sdk.Nodes;

internal static class RevisionOperations
{
    public static async ValueTask<RevisionWriter> OpenForWritingAsync(
        ProtonDriveClient client,
        RevisionUid revisionUid,
        FileSecrets fileSecrets,
        Action<int> releaseBlocksAction,
        CancellationToken cancellationToken)
    {
        var membershipAddress = await NodeOperations.GetMembershipAddressAsync(client, revisionUid.NodeUid, cancellationToken).ConfigureAwait(false);
        var signingKey = await client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, cancellationToken).ConfigureAwait(false);

        await client.BlockUploader.FileSemaphore.WaitAsync(cancellationToken).ConfigureAwait(false);

        return new RevisionWriter(
            client,
            revisionUid,
            fileSecrets.Key,
            fileSecrets.ContentKey,
            signingKey,
            membershipAddress,
            releaseBlocksAction,
            () => client.BlockUploader.FileSemaphore.Release(),
            client.TargetBlockSize,
            client.MaxBlockSize);
    }

    internal static async ValueTask<RevisionReader> OpenForReadingAsync(
        ProtonDriveClient client,
        RevisionUid revisionUid,
        Action<int> releaseBlockListingAction,
        CancellationToken cancellationToken)
    {
        var fileSecrets = await FileOperations.GetSecretsAsync(client, revisionUid.NodeUid, cancellationToken).ConfigureAwait(false);

        var (fileUid, revisionId) = revisionUid;

        var revisionResponse = await client.Api.Files.GetRevisionAsync(
            fileUid.VolumeId,
            fileUid.LinkId,
            revisionId,
            RevisionReader.MinBlockIndex,
            RevisionReader.DefaultBlockPageSize,
            false,
            cancellationToken).ConfigureAwait(false);

        await client.BlockDownloader.FileSemaphore.WaitAsync(cancellationToken).ConfigureAwait(false);

        return new RevisionReader(client, revisionUid, fileSecrets.Key, fileSecrets.ContentKey, revisionResponse.Revision, releaseBlockListingAction);
    }
}
