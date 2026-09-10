using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Nodes;

public sealed class NodeOutOfSyncException : ValidationException
{
    public NodeOutOfSyncException()
    {
    }

    public NodeOutOfSyncException(string? message)
        : base(message)
    {
    }

    public NodeOutOfSyncException(string? message, Exception? innerException)
        : base(message, innerException)
    {
    }

    internal NodeOutOfSyncException(NodeUid nodeUid, ApiResponse response)
        : base(response.ErrorMessage, innerException: null, response.Code)
    {
        NodeUid = nodeUid;
    }

    public NodeUid? NodeUid { get; }
}
