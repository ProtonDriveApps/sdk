using Proton.Drive.Sdk.Api.Links;

namespace Proton.Drive.Sdk.Nodes;

public sealed class InvalidNodeTypeException : ProtonDriveException
{
    public InvalidNodeTypeException(string message)
        : base(message)
    {
    }

    public InvalidNodeTypeException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    public InvalidNodeTypeException()
    {
    }

    internal InvalidNodeTypeException(NodeUid nodeId, LinkType actualType)
        : this(GetMessage(nodeId, actualType))
    {
    }

    internal static string GetMessage(NodeUid nodeId, LinkType actualType)
    {
        return $"Expected node \"{nodeId}\" to be of type {GetExpectedTypeString(actualType)}, but is of type {GetActualTypeString(actualType)} instead.";
    }

    private static string GetActualTypeString(LinkType actualType) => actualType is LinkType.File ? "file" : "folder";
    private static string GetExpectedTypeString(LinkType actualType) => actualType is LinkType.File ? "folder" : "file";
}
