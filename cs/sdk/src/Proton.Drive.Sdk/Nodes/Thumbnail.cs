namespace Proton.Drive.Sdk.Nodes;

public sealed class Thumbnail(ThumbnailType type, ReadOnlyMemory<byte> content)
{
    public ThumbnailType Type { get; } = type;
    public ReadOnlyMemory<byte> Content { get; } = content;
}
