using System.Diagnostics.CodeAnalysis;

namespace Proton.Drive.Sdk.Nodes;

public sealed record AlbumNode : FolderNode
{
    [SetsRequiredMembers]
    public AlbumNode(FolderNode node)
        : base(node)
    {
    }

    public int PhotoCount { get; init; }

    public NodeUid? CoverPhotoUid { get; init; }

    public DateTime? LastActivityTime { get; init; }
}
