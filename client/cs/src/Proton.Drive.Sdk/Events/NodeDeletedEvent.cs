using Proton.Drive.Sdk.Nodes;

namespace Proton.Drive.Sdk.Events;

/// <summary>
/// Represents an event indicating that a node was permanently deleted (from the user's trash), or made no longer accessible to the user.
/// </summary>
/// <param name="id">The unique event ID.</param>
/// <param name="nodeUid">The node UID of the file or folder that was deleted.</param>
/// <param name="parentNodeUid">The parent node UID, if any.</param>
public sealed class NodeDeletedEvent(DriveEventId id, NodeUid nodeUid, NodeUid? parentNodeUid)
    : NodeEvent(id, nodeUid, parentNodeUid);
