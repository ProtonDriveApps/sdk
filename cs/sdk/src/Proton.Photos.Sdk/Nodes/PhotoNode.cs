using Proton.Drive.Sdk.Nodes;

namespace Proton.Photos.Sdk.Nodes;

public sealed record PhotoNode : FileNode
{
    public required DateTime CaptureTime { get; init; }
}
