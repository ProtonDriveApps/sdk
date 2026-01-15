using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Caching;

internal interface IDriveSecretCache
{
    ValueTask SetShareKeyAsync(ShareId shareId, PgpPrivateKey shareKey, CancellationToken cancellationToken);

    ValueTask<PgpPrivateKey?> TryGetShareKeyAsync(ShareId shareId, CancellationToken cancellationToken);

    ValueTask SetFolderSecretsAsync(
        NodeUid nodeId,
        Result<FolderSecrets, DegradedFolderSecrets> secretsProvisionResult,
        CancellationToken cancellationToken);

    ValueTask<Result<FolderSecrets, DegradedFolderSecrets>?> TryGetFolderSecretsAsync(NodeUid nodeId, CancellationToken cancellationToken);

    ValueTask SetFileSecretsAsync(NodeUid nodeId, Result<FileSecrets, DegradedFileSecrets> secretsProvisionResult, CancellationToken cancellationToken);

    ValueTask<Result<FileSecrets, DegradedFileSecrets>?> TryGetFileSecretsAsync(NodeUid nodeId, CancellationToken cancellationToken);

    ValueTask ClearAsync();
}
