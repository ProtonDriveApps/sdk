using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;

namespace Proton.Drive.Sdk.Caching;

internal interface IDriveSecretCache
{
    ValueTask SetShareKeyAsync(ShareId shareId, PgpPrivateKey shareKey, CancellationToken cancellationToken);

    ValueTask<PgpPrivateKey?> TryGetShareKeyAsync(ShareId shareId, CancellationToken cancellationToken);

    ValueTask SetFolderSecretsAsync(NodeUid nodeId, FolderSecrets secrets, CancellationToken cancellationToken);

    ValueTask<FolderSecrets?> TryGetFolderSecretsAsync(NodeUid nodeId, CancellationToken cancellationToken);

    ValueTask SetFileSecretsAsync(NodeUid nodeId, FileSecrets secrets, CancellationToken cancellationToken);

    ValueTask<FileSecrets?> TryGetFileSecretsAsync(NodeUid nodeId, CancellationToken cancellationToken);

    ValueTask ClearAsync();
}
