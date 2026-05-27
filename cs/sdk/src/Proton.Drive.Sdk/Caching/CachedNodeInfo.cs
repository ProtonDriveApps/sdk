using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;

namespace Proton.Drive.Sdk.Caching;

internal readonly record struct CachedNodeInfo(Node Node, ShareId? MembershipShareId, ReadOnlyMemory<byte> NameHashDigest);
