using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Shares;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Caching;

internal interface IDriveEntityCache : IEntityCache
{
    ValueTask SetClientUidAsync(string clientUid, CancellationToken cancellationToken);
    ValueTask<string?> TryGetClientUidAsync(CancellationToken cancellationToken);

    ValueTask SetMainVolumeIdAsync(VolumeId? volumeId, CancellationToken cancellationToken);
    ValueTask<(bool Exists, VolumeId? VolumeId)> TryGetMainVolumeIdAsync(CancellationToken cancellationToken);

    ValueTask SetPhotosVolumeIdAsync(VolumeId? volumeId, CancellationToken cancellationToken);
    ValueTask<(bool Exists, VolumeId? VolumeId)> TryGetPhotosVolumeIdAsync(CancellationToken cancellationToken);

    ValueTask SetMyFilesShareIdAsync(ShareId shareId, CancellationToken cancellationToken);
    ValueTask<ShareId?> TryGetMyFilesShareIdAsync(CancellationToken cancellationToken);

    ValueTask SetPhotosShareIdAsync(ShareId shareId, CancellationToken cancellationToken);
    ValueTask<ShareId?> TryGetPhotosShareIdAsync(CancellationToken cancellationToken);

    ValueTask SetShareAsync(Share share, CancellationToken cancellationToken);
    ValueTask<Share?> TryGetShareAsync(ShareId shareId, CancellationToken cancellationToken);

    ValueTask RemoveNodeAsync(NodeUid nodeUid, CancellationToken cancellationToken);
}
