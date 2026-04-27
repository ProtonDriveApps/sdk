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
        CancellationToken cancellationToken)
    {
        var (fileUid, revisionId) = revisionUid;

        var secretsTask = FileOperations.GetSecretsAsync(
            client,
            revisionUid.NodeUid,
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

        var fileSecretsResult = await secretsTask.ConfigureAwait(false);
        var revisionResponse = await revisionTask.ConfigureAwait(false);

        var (key, contentKey) = fileSecretsResult.TryGetValueElseError(out var fileSecrets, out var degradedFileSecrets)
            ? (fileSecrets.Key, fileSecrets.ContentKey)
            : (degradedFileSecrets.Key ?? throw new InvalidOperationException($"Node key not available for file {revisionUid.NodeUid}"),
                degradedFileSecrets.ContentKey ?? throw new InvalidOperationException($"Content key not available for file {revisionUid.NodeUid}"));

        return new DownloadState(
            revisionUid,
            key,
            contentKey,
            revisionResponse.Revision,
            queueToken,
            client.Telemetry.GetLogger("Download state"));
    }

    internal static RevisionReader OpenForReading(ProtonDriveClient client, DownloadState downloadState)
    {
        return new RevisionReader(client, downloadState);
    }
}
