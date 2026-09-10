using Proton.Drive.Sdk.Api;

namespace Proton.Drive.Sdk.Nodes;

public sealed class NodeNotFoundException : ValidationException
{
    public NodeNotFoundException()
    {
    }

    public NodeNotFoundException(string? message)
        : this(message, innerException: null)
    {
    }

    public NodeNotFoundException(string? message, Exception? innerException)
        : this(nodeUid: null, message, innerException)
    {
    }

    internal NodeNotFoundException(NodeUid? nodeUid, string? message = null, Exception? innerException = null)
        : base(message ?? "Node not found", innerException, DriveApiResponseCodes.DoesNotExist)
    {
        NodeUid = nodeUid;
    }

    public NodeUid? NodeUid { get; }
}
