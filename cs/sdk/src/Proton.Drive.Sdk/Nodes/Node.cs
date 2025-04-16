using System.Text.Json.Serialization;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(FolderNode), typeDiscriminator: "folder")]
[JsonDerivedType(typeof(FileNode), typeDiscriminator: "file")]
[JsonDerivedType(typeof(FileDraftNode), typeDiscriminator: "fileDraft")]
public abstract class Node
{
    public required NodeUid Id { get; init; }

    public required NodeUid? ParentId { get; init; }

    public required string Name { get; init; }

    public required bool IsTrashed { get; init; }

    public required Result<Author, SignatureVerificationError> NameAuthor { get; init; }

    public required Result<Author, SignatureVerificationError> Author { get; init; }
}
