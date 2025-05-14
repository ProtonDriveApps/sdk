using Proton.Drive.Sdk.Api.Shares;

namespace Proton.Drive.Sdk.Nodes;

internal sealed record DegradedFileMetadata(
    DegradedFileNode Node,
    DegradedFileSecrets Secrets,
    ShareId? MembershipShareId,
    ReadOnlyMemory<byte> NameHashDigest);
