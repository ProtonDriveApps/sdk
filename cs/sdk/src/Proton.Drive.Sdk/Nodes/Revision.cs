using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

public sealed class Revision
{
    public required RevisionId Id { get; init; }
    public required DateTime CreationTime { get; init; }
    public required long StorageQuotaConsumption { get; init; }
    public required long? ClaimedSize { get; init; }
    public required DateTime? ClaimedModificationTime { get; init; }
    public required IReadOnlyList<ReadOnlyMemory<byte>> Thumbnails { get; init; }
    public required Result<Author, SignatureVerificationError>? MetadataAuthor { get; init; }
}
