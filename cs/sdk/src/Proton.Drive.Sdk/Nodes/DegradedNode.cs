using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

public abstract class DegradedNode
{
    public required NodeUid Id { get; init; }

    public required NodeUid? ParentId { get; init; }

    public required Result<string, ProtonDriveError> Name { get; init; }

    public required Result<Author, SignatureVerificationError> NameAuthor { get; init; }

    public required bool IsTrashed { get; init; }

    public required Result<Author, SignatureVerificationError> Author { get; init; }

    public required IReadOnlyList<ProtonDriveError> Errors { get; init; }
}
