using System.Text.Json.Serialization;
using Proton.Sdk;
using Proton.Sdk.Drive;

namespace Proton.Drive.Sdk.Nodes;

[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(FolderNode), typeDiscriminator: "folder")]
public abstract class Node
{
    public required NodeUid Id { get; init; }

    public NodeUid? ParentId { get; init; }

    public required Result<string, Error> Name { get; init; }

    public required Result<Author, SignatureVerificationError> NameAuthor { get; init; }

    public required NodeState State { get; init; }

    public required Result<Author, SignatureVerificationError> KeyAuthor { get; init; }
}
