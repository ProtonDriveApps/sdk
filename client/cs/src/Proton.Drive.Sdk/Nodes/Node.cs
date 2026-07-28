using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Events;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

public abstract record Node
{
    public required NodeUid Uid { get; init; }

    public required NodeUid? ParentUid { get; init; }

    [JsonIgnore]
    public DriveEventScopeId TreeEventScopeId => new(Uid.VolumeId);

    public required Result<string, ProtonDriveError> Name { get; init; }

    public required DateTime CreationTime { get; init; }

    public DateTime? TrashTime { get; init; }

    public required Result<Author, SignatureVerificationError> NameAuthor { get; init; }

    public required Result<Author, SignatureVerificationError> KeyAuthor { get; init; }

    public required OwnedBy OwnedBy { get; init; }

    public required bool IsShared { get; init; }

    public required bool IsSharedByUrl { get; init; }

    public required IReadOnlyList<ProtonDriveError> Errors { get; init; }
}
