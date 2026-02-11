namespace Proton.Drive.Sdk.Nodes;

public sealed record DegradedPhotoNode : DegradedFileNode
{
    public required DateTime CaptureTime { get; init; }
}
