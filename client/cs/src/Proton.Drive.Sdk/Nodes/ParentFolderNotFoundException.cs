using Proton.Drive.Sdk.Api;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Nodes;

public sealed class ParentFolderNotFoundException : ValidationException
{
    public ParentFolderNotFoundException()
    {
    }

    public ParentFolderNotFoundException(string? message)
        : base(message)
    {
    }

    public ParentFolderNotFoundException(string? message, Exception? innerException)
        : base(message, innerException)
    {
    }

    internal ParentFolderNotFoundException(NodeUid parentFolderUid, ApiResponse response)
        : base(response.ErrorMessage, innerException: null, DriveApiResponseCodes.DoesNotExist)
    {
        ParentFolderUid = parentFolderUid;
    }

    public NodeUid? ParentFolderUid { get; }
}
