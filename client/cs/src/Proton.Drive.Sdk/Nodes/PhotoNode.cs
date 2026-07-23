namespace Proton.Drive.Sdk.Nodes;

public sealed record PhotoNode : FileNode
{
    public required DateTime CaptureTime { get; init; }

    public required IReadOnlyList<NodeUid> AlbumUids { get; init; }

    public required IReadOnlyList<PhotoTag> Tags { get; init; }

    public required IReadOnlyList<NodeUid> RelatedPhotoUids { get; init; }

    public ReadOnlyMemory<byte>? ContentHash { get; init; }
}
