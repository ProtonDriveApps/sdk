namespace Proton.Drive.Sdk.Api.Files;

internal sealed class BlockListingRevisionDto : RevisionDto
{
    public required IReadOnlyList<Block> Blocks { get; init; }
}
