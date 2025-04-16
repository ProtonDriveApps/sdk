namespace Proton.Drive.Sdk.Nodes;

internal sealed class CommonExtendedAttributes
{
    public long? Size { get; init; }

    public DateTime? ModificationTime { get; init; }

    public IReadOnlyList<int>? BlockSizes { get; init; }
}
