using Proton.Drive.Sdk.Api;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Nodes;

public sealed class AlbumContainsPhotosNotInTimelineException : ValidationException
{
    public AlbumContainsPhotosNotInTimelineException()
    {
    }

    public AlbumContainsPhotosNotInTimelineException(string? message)
        : base(message)
    {
    }

    public AlbumContainsPhotosNotInTimelineException(string? message, Exception? innerException)
        : base(message, innerException)
    {
    }

    internal AlbumContainsPhotosNotInTimelineException(IReadOnlyList<NodeUid> photosOnlyInAlbumNodeUids, ApiResponse response)
        : base(response.ErrorMessage, innerException: null, DriveApiResponseCodes.AlbumContainsPhotosNotInTimeline)
    {
        PhotosOnlyInAlbumNodeUids = photosOnlyInAlbumNodeUids;
    }

    public IReadOnlyList<NodeUid> PhotosOnlyInAlbumNodeUids { get; } = [];
}
