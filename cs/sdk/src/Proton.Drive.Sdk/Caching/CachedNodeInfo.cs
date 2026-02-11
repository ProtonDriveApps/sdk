using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Caching;

internal readonly record struct CachedNodeInfo(
    Result<Node, DegradedNode> NodeProvisionResult,
    ShareId? MembershipShareId,
    ReadOnlyMemory<byte> NameHashDigest);
