using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Nodes.Download;
using Proton.Drive.Sdk.Nodes.Upload;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal static partial class RevisionOperations
{
    public static async ValueTask<(RevisionUid RevisionUid, FileSecrets FileSecrets)> CreateDraftAsync(
        ProtonDriveClient client,
        NodeUid fileUid,
        RevisionId lastKnownRevisionId,
        CancellationToken cancellationToken)
    {
        var parameters = new RevisionCreationRequest
        {
            CurrentRevisionId = lastKnownRevisionId,
            ClientId = client.Uid,
        };

        var fileSecretsResult = await FileOperations.GetSecretsAsync(client, fileUid, cancellationToken).ConfigureAwait(false);

        if (!fileSecretsResult.TryGetValueElseError(out var fileSecrets, out _))
        {
            throw new InvalidOperationException($"Cannot create draft for file {fileUid} with degraded secrets");
        }

        RevisionId revisionId;
        try
        {
            var revisionResponse = await client.Api.Files.CreateRevisionAsync(fileUid.VolumeId, fileUid.LinkId, parameters, cancellationToken)
                .ConfigureAwait(false);

            revisionId = revisionResponse.Identity.RevisionId;
        }
        catch (ProtonApiException<RevisionConflictResponse> e)
            when (e.Response is { Conflict.DraftRevisionId: { } draftRevisionId }
                && (e.Response.Conflict.DraftClientUid == client.Uid))
        {
            revisionId = draftRevisionId;
        }
        catch (ProtonApiException<RevisionConflictResponse> e)
        {
            throw new RevisionDraftConflictException(e);
        }

        return (new RevisionUid(fileUid, revisionId), fileSecrets);
    }

    public static async ValueTask<RevisionWriter> OpenForWritingAsync(
        ProtonDriveClient client,
        RevisionUid revisionUid,
        FileSecrets fileSecrets,
        Action<int> releaseBlocksAction,
        CancellationToken cancellationToken)
    {
        var membershipAddress = await NodeOperations.GetMembershipAddressAsync(client, revisionUid.NodeUid, cancellationToken).ConfigureAwait(false);
        var signingKey = await client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, cancellationToken).ConfigureAwait(false);

        await client.BlockUploader.Queue.StartFileAsync(cancellationToken).ConfigureAwait(false);

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
