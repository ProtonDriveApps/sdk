using System.Text.Json.Serialization;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(DegradedFolderNode), typeDiscriminator: "folder")]
[JsonDerivedType(typeof(DegradedFileNode), typeDiscriminator: "file")]
[JsonDerivedType(typeof(DegradedPhotoNode), typeDiscriminator: "photo")]
public abstract record DegradedNode
{
    public required NodeUid Uid { get; init; }

    public required NodeUid? ParentUid { get; init; }

    public string TreeEventScopeId => Uid.VolumeId.ToString();

    public required Result<string, ProtonDriveError> Name { get; init; }

    public required Result<Author, SignatureVerificationError> NameAuthor { get; init; }

    public required DateTime CreationTime { get; init; }

    public DateTime? TrashTime { get; init; }

    public required Result<Author, SignatureVerificationError> Author { get; init; }

    public required IReadOnlyList<ProtonDriveError> Errors { get; init; }
}
