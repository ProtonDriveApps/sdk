namespace Proton.Drive.Sdk.Nodes;

public sealed class FolderProvisionError(DegradedFolderNode degradedNode, string? message, ProtonDriveError? innerError = null)
    : ProtonDriveError(message, innerError)
{
    public DegradedFolderNode DegradedNode { get; } = degradedNode;
}
