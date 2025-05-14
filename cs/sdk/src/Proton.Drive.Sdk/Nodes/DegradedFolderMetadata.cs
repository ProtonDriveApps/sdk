using Proton.Drive.Sdk.Api.Shares;

namespace Proton.Drive.Sdk.Nodes;

internal sealed record DegradedFolderMetadata(
    DegradedFolderNode Node,
    DegradedFolderSecrets Secrets,
    ShareId? MembershipShareId,
    ReadOnlyMemory<byte> NameHashDigest);
