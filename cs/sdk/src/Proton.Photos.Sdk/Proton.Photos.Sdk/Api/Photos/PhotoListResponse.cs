namespace Proton.Photos.Sdk.Api.Photos;

internal sealed class PhotoListResponse
{
    public required IReadOnlyList<PhotoDto> Photos { get; init; }
}
