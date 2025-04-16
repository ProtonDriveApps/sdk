namespace Proton.Drive.Sdk.Nodes;

public abstract class FileOrFileDraftNode : Node
{
    public required string MediaType { get; init; }
}
