using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

public abstract record DegradedNode
{
    public required NodeUid Uid { get; init; }

    public required NodeUid? ParentUid { get; init; }

    public required RefResult<string, ProtonDriveError> Name { get; init; }

    public required ValResult<Author, SignatureVerificationError> NameAuthor { get; init; }

    public DateTime? TrashTime { get; init; }

    public required ValResult<Author, SignatureVerificationError> Author { get; init; }

    public required IReadOnlyList<ProtonDriveError> Errors { get; init; }
}
