namespace Proton.Drive.Sdk.Nodes;

public sealed record PhotoNode : FileNode
{
    public required DateTime CaptureTime { get; init; }
}
