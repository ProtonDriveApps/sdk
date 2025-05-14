namespace Proton.Drive.Sdk.Nodes;

public abstract record FileOrFileDraftNode : Node
{
    public required string MediaType { get; init; }
}
