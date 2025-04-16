namespace Proton.Drive.Sdk.Nodes;

public sealed class FileNode : FileOrFileDraftNode
{
    public required Revision ActiveRevision { get; init; }

    public required long TotalStorageQuotaUsage { get; init; }
}
