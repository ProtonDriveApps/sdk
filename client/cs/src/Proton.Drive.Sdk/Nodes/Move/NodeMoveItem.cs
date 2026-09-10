namespace Proton.Drive.Sdk.Nodes.Move;

/// <summary>
/// Represents an item of a node move operation, and contains information about a node to be moved, and how it should be moved and/or renamed.
/// </summary>
/// <param name="NodeUid">The unique identifier of the node being moved.</param>
/// <param name="CurrentParentUid">The unique identifier of the current parent folder.</param>
/// <param name="CurrentName">The current name of the node. Can be empty if the name was not decryptable.</param>
/// <param name="TargetName">The name that the node should have after the operation.</param>
/// <param name="NewMediaType">Reserved for future use. Optional override of the media type of the file. Ignored for folders.</param>
public readonly record struct NodeMoveItem(
    NodeUid NodeUid,
    NodeUid CurrentParentUid,
    string CurrentName,
    string TargetName,
    string? NewMediaType = null);
