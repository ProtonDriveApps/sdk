namespace Proton.Drive.Sdk.Nodes;

public record FileNode : FileOrFileDraftNode
{
    public required Revision ActiveRevision { get; init; }

    public required long TotalSizeOnCloudStorage { get; init; }
}
