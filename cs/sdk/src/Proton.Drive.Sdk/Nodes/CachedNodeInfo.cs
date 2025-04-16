using Proton.Drive.Sdk.Api.Shares;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal readonly record struct CachedNodeInfo(Result<Node, DegradedNode> NodeProvisionResult, ShareId? MembershipShareId, ReadOnlyMemory<byte> NameHashDigest);
