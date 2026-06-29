using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;

namespace Proton.Drive.Sdk.Caching;

// This forces the deserializer to not use the implicit default constructor of the struct, thereby enabling required parameter enforcement
[method: JsonConstructor]
internal readonly record struct CachedNodeInfo(Node Node, ShareId? MembershipShareId, ReadOnlyMemory<byte> NameHashDigest);
