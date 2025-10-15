namespace Proton.Drive.Sdk.Api.Files;

internal sealed class CommonExtendedAttributes
{
    public long? Size { get; init; }

    public DateTime? ModificationTime { get; init; }

    public IReadOnlyList<int>? BlockSizes { get; init; }

    public FileContentDigestsDto? Digests { get; init; }
}
