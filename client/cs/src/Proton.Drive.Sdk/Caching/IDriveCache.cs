using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Caching;

internal interface IDriveCache
{
    ValueTask<VolumeId?> GetOrCreateMainVolumeIdAsync(Func<CancellationToken, ValueTask<VolumeId?>> factory, CancellationToken cancellationToken);

    ValueTask SetMainVolumeIdAsync(VolumeId? volumeId, CancellationToken cancellationToken);

    ValueTask<VolumeId?> GetOrCreatePhotosVolumeIdAsync(Func<CancellationToken, ValueTask<VolumeId?>> factory, CancellationToken cancellationToken);

    ValueTask SetPhotosVolumeIdAsync(VolumeId? volumeId, CancellationToken cancellationToken);

    ValueTask<PgpPrivateKey> GetOrCreateShareKeyAsync(
        ShareId shareId,
        Func<CancellationToken, ValueTask<PgpPrivateKey>> factory,
        CancellationToken cancellationToken);

    ValueTask SetShareKeyAsync(ShareId shareId, PgpPrivateKey shareKey, CancellationToken cancellationToken);

    ValueTask<Option<NodeOperationData>> TryGetNodeOperationDataAsync(NodeUid nodeId, CancellationToken cancellationToken);

    ValueTask SetNodeOperationDataAsync(NodeUid nodeId, NodeOperationData operationData, CancellationToken cancellationToken);

    ValueTask ClearAsync();
}
