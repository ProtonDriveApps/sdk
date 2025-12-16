using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;
using Proton.Sdk;

namespace Proton.Photos.Sdk.Caching;

internal interface IPhotosSecretCache
{
    ValueTask SetShareKeyAsync(ShareId shareId, PgpPrivateKey shareKey, CancellationToken cancellationToken);

    ValueTask SetFolderSecretsAsync(
        NodeUid nodeId,
        Result<FolderSecrets, DegradedFolderSecrets> secretsProvisionResult,
        CancellationToken cancellationToken);

    ValueTask<Result<FolderSecrets, DegradedFolderSecrets>?> TryGetFolderSecretsAsync(NodeUid nodeId, CancellationToken cancellationToken);
}
