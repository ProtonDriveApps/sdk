namespace Proton.Photos.Sdk.Api.Photos;

internal sealed class TimelinePhotoListResponse
{
    public required IReadOnlyList<TimelinePhotoDto> Photos { get; init; }
}
