using Proton.Drive.Sdk.Api;

namespace Proton.Drive.Sdk.Nodes;

public sealed class NodeNotFoundException : ValidationException
{
    public NodeNotFoundException()
    {
    }

    public NodeNotFoundException(string message)
        : base(message)
    {
    }

    public NodeNotFoundException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    internal NodeNotFoundException(NodeUid nodeUid, string message = "Node not found")
        : base(message)
    {
        Code = DriveApiResponseCodes.DoesNotExist;
        NodeUid = nodeUid;
    }

    public NodeUid? NodeUid { get; }
}
