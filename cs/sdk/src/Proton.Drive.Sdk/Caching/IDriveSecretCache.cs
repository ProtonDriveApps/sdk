using Proton.Cryptography.Pgp;

namespace Proton.Drive.Sdk.Caching;

internal interface IDriveSecretCache
{
    ValueTask SetShareKeyAsync(ShareId shareId, PgpPrivateKey shareKey, CancellationToken cancellationToken);
    ValueTask<PgpPrivateKey?> TryGetShareKeyAsync(ShareId shareId, CancellationToken cancellationToken);

    ValueTask SetNodeKeyAsync(NodeUid nodeId, PgpPrivateKey nodeKey, CancellationToken cancellationToken);
    ValueTask<PgpPrivateKey?> TryGetNodeKeyAsync(NodeUid nodeId, CancellationToken cancellationToken);

    ValueTask SetFolderHashKeyAsync(NodeUid nodeId, ReadOnlySpan<byte> folderHashKey, CancellationToken cancellationToken);
    ValueTask<ReadOnlyMemory<byte>?> TryGetFolderHashKeyAsync(NodeUid nodeId, CancellationToken cancellationToken);
}
