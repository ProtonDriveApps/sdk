using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Shares;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;

namespace Proton.Photos.Sdk.Caching;

internal interface IPhotosEntityCache
{
    ValueTask SetPhotosVolumeIdAsync(VolumeId volumeId, CancellationToken cancellationToken);

    ValueTask SetPhotosShareIdAsync(ShareId shareId, CancellationToken cancellationToken);

    ValueTask<ShareId?> TryGetPhotosShareIdAsync(CancellationToken cancellationToken);

    ValueTask SetShareAsync(Share share, CancellationToken cancellationToken);

    ValueTask SetNodeAsync(
        NodeUid nodeId,
        Result<Node, DegradedNode> nodeProvisionResult,
        ShareId? membershipShareId,
        ReadOnlyMemory<byte> nameHashDigest,
        CancellationToken cancellationToken);

    ValueTask<CachedNodeInfo?> TryGetNodeAsync(NodeUid nodeId, CancellationToken cancellationToken);
}
