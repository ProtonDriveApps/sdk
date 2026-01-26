using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Caching;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Shares;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Photos.Sdk.Caching;

internal interface IPhotosEntityCache : IEntityCache
{
    ValueTask SetPhotosVolumeIdAsync(VolumeId volumeId, CancellationToken cancellationToken);

    ValueTask SetPhotosShareIdAsync(ShareId shareId, CancellationToken cancellationToken);

    ValueTask<ShareId?> TryGetPhotosShareIdAsync(CancellationToken cancellationToken);

    ValueTask SetShareAsync(Share share, CancellationToken cancellationToken);

    ValueTask<CachedNodeInfo?> TryGetNodeAsync(NodeUid nodeId, CancellationToken cancellationToken);
}
