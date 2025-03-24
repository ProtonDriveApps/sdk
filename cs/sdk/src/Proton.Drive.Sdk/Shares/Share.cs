using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;

namespace Proton.Drive.Sdk.Shares;

internal sealed class Share(ShareId id, NodeUid rootFolderId)
{
    public ShareId Id { get; } = id;
    public NodeUid RootFolderId { get; } = rootFolderId;
}
