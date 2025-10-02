using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

public sealed record Revision
{
    public required RevisionUid Uid { get; init; }
    public required DateTime CreationTime { get; init; }
    public required long SizeOnCloudStorage { get; init; }
    public required long? ClaimedSize { get; init; }
    public required DateTime? ClaimedModificationTime { get; init; }
    public required IReadOnlyList<ReadOnlyMemory<byte>> Thumbnails { get; init; }
    public required Result<Author, SignatureVerificationError>? ContentAuthor { get; init; }
}
