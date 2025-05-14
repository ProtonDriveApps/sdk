using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Shares;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Caching;

internal interface IDriveEntityCache
{
    ValueTask SetClientUidAsync(string clientUid, CancellationToken cancellationToken);
    ValueTask<string?> TryGetClientUidAsync(CancellationToken cancellationToken);

    ValueTask SetMainVolumeIdAsync(VolumeId volumeId, CancellationToken cancellationToken);
    ValueTask<VolumeId?> TryGetMainVolumeIdAsync(CancellationToken cancellationToken);

    ValueTask SetMyFilesShareIdAsync(ShareId shareId, CancellationToken cancellationToken);
    ValueTask<ShareId?> TryGetMyFilesShareIdAsync(CancellationToken cancellationToken);

    ValueTask SetShareAsync(Share share, CancellationToken cancellationToken);
    ValueTask<Share?> TryGetShareAsync(ShareId shareId, CancellationToken cancellationToken);

    ValueTask SetNodeAsync(
        NodeUid nodeId,
        RefResult<Node, DegradedNode> nodeProvisionResult,
        ShareId? membershipShareId,
        ReadOnlyMemory<byte> nameHashDigest,
        CancellationToken cancellationToken);

    ValueTask<CachedNodeInfo?> TryGetNodeAsync(NodeUid nodeId, CancellationToken cancellationToken);
}
