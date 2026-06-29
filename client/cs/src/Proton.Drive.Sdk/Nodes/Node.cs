using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Events;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(FolderNode), typeDiscriminator: "folder")]
[JsonDerivedType(typeof(FileNode), typeDiscriminator: "file")]
[JsonDerivedType(typeof(FileDraftNode), typeDiscriminator: "fileDraft")]
[JsonDerivedType(typeof(PhotoNode), typeDiscriminator: "photo")]
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

    public required Result<Author, SignatureVerificationError> Author { get; init; }

    public required OwnedBy OwnedBy { get; init; }

    public required IReadOnlyList<ProtonDriveError> Errors { get; init; }
}
