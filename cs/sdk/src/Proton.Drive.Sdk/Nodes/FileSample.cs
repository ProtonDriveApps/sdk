namespace Proton.Drive.Sdk.Nodes;

public sealed class FileSample(FileSamplePurpose purpose, ArraySegment<byte> content)
{
    public FileSamplePurpose Purpose { get; } = purpose;
    public ArraySegment<byte> Content { get; } = content;
}
