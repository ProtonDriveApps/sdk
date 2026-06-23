namespace Proton.Drive.Sdk.Nodes;

public sealed class Thumbnail
{
    public Thumbnail(ThumbnailType type, ReadOnlyMemory<byte> content)
    {
        if (content.IsEmpty)
        {
            throw new ArgumentException("Thumbnail content must not be empty.", nameof(content));
        }

        Type = type;
        Content = content;
    }

    public ThumbnailType Type { get; }
    public ReadOnlyMemory<byte> Content { get; }
}
