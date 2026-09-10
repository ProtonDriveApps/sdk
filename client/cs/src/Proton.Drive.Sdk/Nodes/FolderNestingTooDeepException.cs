using Proton.Drive.Sdk.Api;
using Proton.Drive.Sdk.Api.Files;

namespace Proton.Drive.Sdk.Nodes;

public sealed class FolderNestingTooDeepException : ValidationException
{
    public FolderNestingTooDeepException()
    {
    }

    public FolderNestingTooDeepException(string? message)
        : base(message)
    {
    }

    public FolderNestingTooDeepException(string? message, Exception? innerException)
        : base(message, innerException)
    {
    }

    internal FolderNestingTooDeepException(NodeUid parentFolderUid, DetailedApiResponse response)
        : base(response.ErrorMessage, innerException: null, DriveApiResponseCodes.NestingTooDeep)
    {
        ParentFolderUid = parentFolderUid;
    }

    public NodeUid? ParentFolderUid { get; }
}
