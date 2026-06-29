using Proton.Drive.Sdk.Account.Addresses;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;

namespace Proton.Drive.Sdk.Shares;

internal sealed class Share(ShareId id, NodeUid rootFolderId, AddressId membershipAddressId, ShareType type)
{
    public ShareId Id { get; } = id;
    public NodeUid RootFolderId { get; } = rootFolderId;
    public AddressId MembershipAddressId { get; } = membershipAddressId;
    public ShareType Type { get; } = type;
}
