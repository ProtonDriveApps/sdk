using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

public sealed record Revision
{
    public required RevisionUid Uid { get; init; }
    public required RevisionState State { get; init; }
    public required DateTime CreationTime { get; init; }
    public required long StorageSize { get; init; }
    public long? ClaimedSize { get; init; }
    public FileContentDigests ClaimedDigests { get; init; }
    public DateTimeOffset? ClaimedModificationTime { get; init; }
    public required IReadOnlyList<ThumbnailHeader> Thumbnails { get; init; }
    public required IReadOnlyList<AdditionalMetadataProperty>? ClaimedAdditionalMetadata { get; init; }
    public Result<Author, SignatureVerificationError>? ContentAuthor { get; init; }
}
