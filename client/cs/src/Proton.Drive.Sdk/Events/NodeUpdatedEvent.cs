using Proton.Drive.Sdk.Nodes;

namespace Proton.Drive.Sdk.Events;

/// <summary>
/// Represents an event indicating that a node was created, updated, moved to trash, or made newly accessible to the user through a move operation or a change of permissions.
/// </summary>
/// <param name="id">The unique event ID.</param>
/// <param name="nodeUid">The node UID of the affected file or folder.</param>
/// <param name="parentNodeUid">The parent node UID, if any.</param>
/// <param name="isTrashed">Whether the affected node is in the trash.</param>
/// <param name="isShared">Whether the affected node is shared with others.</param>
public sealed class NodeUpdatedEvent(
    DriveEventId id,
    NodeUid nodeUid,
    NodeUid? parentNodeUid,
    bool isTrashed,
    bool isShared) : NodeEvent(id, nodeUid, parentNodeUid)
{
    /// <summary>
    /// Whether the affected node is in the trash.
    /// </summary>
    public bool IsTrashed { get; } = isTrashed;

    /// <summary>
    /// Whether the affected node is shared with others.
    /// </summary>
    public bool IsShared { get; } = isShared;
}
