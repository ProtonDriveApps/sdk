using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal static class FileOperations
{
    public static async ValueTask<FileSecrets> GetSecretsAsync(ProtonDriveClient client, NodeUid fileUid, CancellationToken cancellationToken)
    {
        var fileSecretsResult = await client.Cache.Secrets.TryGetFileSecretsAsync(fileUid, cancellationToken).ConfigureAwait(false);

        var fileSecrets = fileSecretsResult?.GetValueOrDefault();

        if (fileSecrets is null)
        {
            var metadataResult = await NodeOperations.GetFreshNodeMetadataAsync(client, fileUid, knownShareAndKey: null, cancellationToken)
                .ConfigureAwait(false);

            fileSecrets = metadataResult.GetFileSecretsOrThrow();
        }

        return fileSecrets;
    }
}
