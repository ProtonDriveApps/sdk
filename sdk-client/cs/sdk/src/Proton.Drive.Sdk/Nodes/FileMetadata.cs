using Proton.Drive.Sdk.Api.Shares;

namespace Proton.Drive.Sdk.Nodes;

internal readonly record struct FileMetadata(FileNode Node, FileSecrets Secrets, ShareId? MembershipShareId, ReadOnlyMemory<byte> NameHashDigest);
