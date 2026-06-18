namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class TimelinePhotoListResponse
{
    public required IReadOnlyList<TimelinePhotoDto> Photos { get; init; }
}
