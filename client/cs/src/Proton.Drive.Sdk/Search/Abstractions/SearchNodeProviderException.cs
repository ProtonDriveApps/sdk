namespace Proton.Drive.Sdk.Search.Abstractions;

public sealed class SearchNodeProviderException : Exception
{
    public SearchNodeProviderException()
    {
    }

    public SearchNodeProviderException(string message)
        : base(message)
    {
    }

    public SearchNodeProviderException(string message, Exception? innerException)
        : base(message, innerException)
    {
    }

    public string? InvalidNodeId { get; init; }

    internal static SearchNodeProviderException ForInvalidNode(string nodeId)
        => new($"Node not found: {nodeId}") { InvalidNodeId = nodeId };
}
