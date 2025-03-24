using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Shares;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Caching;

internal interface IDriveEntityCache
{
    ValueTask SetMainVolumeIdAsync(VolumeId volumeId, CancellationToken cancellationToken);
    ValueTask<VolumeId?> TryGetMainVolumeIdAsync(CancellationToken cancellationToken);

    ValueTask SetMyFilesShareIdAsync(ShareId shareId, CancellationToken cancellationToken);
    ValueTask<ShareId?> TryGetMyFilesShareIdAsync(CancellationToken cancellationToken);

    ValueTask SetShareAsync(Share share, CancellationToken cancellationToken);
    ValueTask<Share?> TryGetShareAsync(ShareId shareId, CancellationToken cancellationToken);

    ValueTask SetNodeAsync(Node node, CancellationToken cancellationToken);
    ValueTask<Node?> TryGetNodeAsync(NodeUid nodeId, CancellationToken cancellationToken);
}
