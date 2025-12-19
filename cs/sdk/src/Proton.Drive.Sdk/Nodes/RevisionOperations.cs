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
        TaskControl<UploadResult> taskControl)
    {
        var (membershipAddress, signingKey) = await taskControl.HandlePauseAsync(async ct =>
        {
            var membershipAddress = await NodeOperations.GetMembershipAddressAsync(client, revisionUid.NodeUid, ct).ConfigureAwait(false);
            var signingKey = await client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, ct).ConfigureAwait(false);

            return (membershipAddress, signingKey);
        }).ConfigureAwait(false);

        await client.BlockUploader.Queue.StartFileAsync(taskControl.CancellationToken).ConfigureAwait(false);

        return new RevisionWriter(
            client,
            revisionUid,
            fileSecrets.Key,
            fileSecrets.ContentKey,
            signingKey,
            membershipAddress,
            releaseBlocksAction,
            () => client.BlockUploader.Queue.FinishFile(),
            client.TargetBlockSize,
            client.MaxBlockSize);
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
