using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;

namespace Proton.Drive.Sdk.Caching;

internal interface IEntityCache
{
    ValueTask SetNodeAsync(NodeUid nodeId, Node node, ShareId? membershipShareId, ReadOnlyMemory<byte> nameHashDigest, CancellationToken cancellationToken);

    ValueTask<CachedNodeInfo?> TryGetNodeAsync(NodeUid nodeId, CancellationToken cancellationToken);
}
