using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Nodes.Cryptography;
using Proton.Drive.Sdk.Nodes.Download;
using Proton.Drive.Sdk.Nodes.Upload;

namespace Proton.Drive.Sdk.Nodes;

internal static class RevisionOperations
{
    public static RevisionWriter OpenForWriting(
        ProtonDriveClient client,
        RevisionDraft draft,
        long queueToken)
    {
        return new RevisionWriter(client, draft, queueToken, client.TargetBlockSize);
    }

    internal static async ValueTask<DownloadState> CreateDownloadStateAsync(
        ProtonDriveClient client,
        RevisionUid revisionUid,
        long queueToken,
        bool forPhotos,
        CancellationToken cancellationToken)
    {
        var (fileUid, revisionId) = revisionUid;

        var secretsTask = FileOperations.GetSecretsAsync(
            client,
            revisionUid.NodeUid,
            forPhotos,
            cancellationToken).AsTask();

        var revisionTask = client.Api.Files.GetRevisionAsync(
            fileUid.VolumeId,
            fileUid.LinkId,
            revisionId,
            RevisionReader.MinBlockIndex,
            RevisionReader.DefaultBlockPageSize,
            withoutBlockUrls: false,
            cancellationToken).AsTask();

        await Task.WhenAll(secretsTask, revisionTask).ConfigureAwait(false);

        var fileSecrets = await secretsTask.ConfigureAwait(false);
        var revisionResponse = await revisionTask.ConfigureAwait(false);

        var key = fileSecrets.Key ?? throw new InvalidOperationException($"Node key not available for file {revisionUid.NodeUid}");
        var contentKey = fileSecrets.ContentKey ?? throw new InvalidOperationException($"Content key not available for file {revisionUid.NodeUid}");

        var claimedSize = await GetClaimedSizeAsync(client, revisionResponse.Revision, key, cancellationToken).ConfigureAwait(false);

        return new DownloadState(
            revisionUid,
            key,
            contentKey,
            revisionResponse.Revision,
            claimedSize,
            queueToken,
            client.Telemetry.GetLogger("Download state"));
    }

    internal static RevisionReader OpenForReading(ProtonDriveClient client, DownloadState downloadState)
    {
        return new RevisionReader(client, downloadState);
    }

    private static async ValueTask<long?> GetClaimedSizeAsync(
        ProtonDriveClient client,
        RevisionDto revision,
        PgpPrivateKey key,
        CancellationToken cancellationToken)
    {
        var contentAuthorshipClaim =
            await AuthorshipClaim.CreateAsync(client.Account, revision.SignatureEmailAddress, cancellationToken).ConfigureAwait(false);

        return NodeCrypto.DecryptExtendedAttributes(revision.ExtendedAttributes, key, contentAuthorshipClaim)
            .TryGetValueElseError(out var extendedAttributesOutput, out _)
            ? extendedAttributesOutput.Data?.Common?.Size
            : null;
    }
}
