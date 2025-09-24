namespace Proton.Drive.Sdk.Nodes;

public sealed record FileNode : FileOrFileDraftNode
{
    public required Revision ActiveRevision { get; init; }

    public required long TotalSizeOnCloudStorage { get; init; }
}
