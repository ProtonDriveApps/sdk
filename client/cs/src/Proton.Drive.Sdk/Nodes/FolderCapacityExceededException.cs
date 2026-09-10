using Proton.Drive.Sdk.Api;
using Proton.Drive.Sdk.Api.Files;

namespace Proton.Drive.Sdk.Nodes;

public sealed class FolderCapacityExceededException : ValidationException
{
    public FolderCapacityExceededException()
    {
    }

    public FolderCapacityExceededException(string? message)
        : base(message)
    {
    }

    public FolderCapacityExceededException(string? message, Exception? innerException)
        : base(message, innerException)
    {
    }

    internal FolderCapacityExceededException(NodeUid parentFolderUid, DetailedApiResponse response)
        : base(response.ErrorMessage, innerException: null, DriveApiResponseCodes.TooManyChildren)
    {
        ParentFolderUid = parentFolderUid;
    }

    public NodeUid? ParentFolderUid { get; }
}
