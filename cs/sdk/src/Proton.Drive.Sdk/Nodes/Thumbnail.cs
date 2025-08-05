namespace Proton.Drive.Sdk.Nodes;

public sealed class Thumbnail(ThumbnailType type, ArraySegment<byte> content)
{
    public ThumbnailType Type { get; } = type;
    public ArraySegment<byte> Content { get; } = content;
}
