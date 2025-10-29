namespace Proton.Drive.Sdk.Api.Files;

internal sealed class BlockListingRevisionDto : RevisionDto
{
    public required IReadOnlyList<BlockDto> Blocks { get; init; }
}
