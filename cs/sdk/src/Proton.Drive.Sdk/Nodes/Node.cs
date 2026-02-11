using System.Text.Json.Serialization;
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

    public string TreeEventScopeId => Uid.VolumeId.ToString();

    public required string Name { get; init; }

    public required DateTime CreationTime { get; init; }

    public DateTime? TrashTime { get; init; }

    public required Result<Author, SignatureVerificationError> NameAuthor { get; init; }

    public required Result<Author, SignatureVerificationError> Author { get; init; }
}
