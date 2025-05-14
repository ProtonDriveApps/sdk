using System.Text.Json.Serialization;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(FolderNode), typeDiscriminator: "folder")]
[JsonDerivedType(typeof(FileNode), typeDiscriminator: "file")]
[JsonDerivedType(typeof(FileDraftNode), typeDiscriminator: "fileDraft")]
public abstract record Node
{
    public required NodeUid Uid { get; init; }

    public required NodeUid? ParentUid { get; init; }

    public required string Name { get; init; }

    public required bool IsTrashed { get; init; }

    public required ValResult<Author, SignatureVerificationError> NameAuthor { get; init; }

    public required ValResult<Author, SignatureVerificationError> Author { get; init; }
}
