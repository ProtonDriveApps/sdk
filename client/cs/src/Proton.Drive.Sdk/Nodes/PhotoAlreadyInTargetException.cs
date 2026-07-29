namespace Proton.Drive.Sdk.Nodes;

public sealed class PhotoAlreadyInTargetException : Exception
{
    public PhotoAlreadyInTargetException()
    {
    }

    public PhotoAlreadyInTargetException(string message)
        : base(message)
    {
    }

    public PhotoAlreadyInTargetException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    internal PhotoAlreadyInTargetException(NodeUid nodeUid)
        : base($"Photo {nodeUid} is already in the target")
    {
        NodeUid = nodeUid;
    }

    public NodeUid? NodeUid { get; }
}
