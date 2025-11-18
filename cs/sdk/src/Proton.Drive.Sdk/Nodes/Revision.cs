using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

public sealed record Revision
{
    public required RevisionUid Uid { get; init; }
    public required DateTime CreationTime { get; init; }
    public required long SizeOnCloudStorage { get; init; }
    public long? ClaimedSize { get; init; }
    public required FileContentDigests ClaimedDigests { get; init; }
    public DateTime? ClaimedModificationTime { get; init; }
    public required IReadOnlyList<ThumbnailHeader> Thumbnails { get; init; }
    public Result<Author, SignatureVerificationError>? ContentAuthor { get; init; }
}
