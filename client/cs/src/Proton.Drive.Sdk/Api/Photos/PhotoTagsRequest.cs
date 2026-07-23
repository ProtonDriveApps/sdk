namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class PhotoTagsRequest
{
    public required IReadOnlyList<int> Tags { get; init; }
}
