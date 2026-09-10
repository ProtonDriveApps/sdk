using Proton.Drive.Sdk.Api;
using Proton.Drive.Sdk.Api.Files;

namespace Proton.Drive.Sdk.Nodes.Move;

public sealed class CannotMoveFavoritePhotoFromShareException : ValidationException
{
    public CannotMoveFavoritePhotoFromShareException()
    {
    }

    public CannotMoveFavoritePhotoFromShareException(string? message)
        : base(message)
    {
    }

    public CannotMoveFavoritePhotoFromShareException(string? message, Exception? innerException)
        : base(message, innerException)
    {
    }

    internal CannotMoveFavoritePhotoFromShareException(NodeUid nodeUid, DetailedApiResponse response)
        : base(response.ErrorMessage, innerException: null, DriveApiResponseCodes.IncompatibleState)
    {
        NodeUid = nodeUid;
    }

    public NodeUid? NodeUid { get; }
}
