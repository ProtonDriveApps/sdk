using Proton.Drive.Sdk.Nodes;

namespace Proton.Drive.Sdk.Events;

/// <summary>
/// Represents a drive event that pertains to a single node.
/// </summary>
/// <param name="id">The unique event ID.</param>
/// <param name="nodeUid">The node UID of the affected file or folder.</param>
/// <param name="parentNodeUid">The parent node UID, if known.</param>
public abstract class NodeEvent(DriveEventId id, NodeUid nodeUid, NodeUid? parentNodeUid) : DriveEvent(id)
{
    /// <summary>
    /// The node UID of the affected file or folder.
    /// </summary>
    public NodeUid NodeUid { get; } = nodeUid;

    /// <summary>
    /// The parent node UID, if any.
    /// </summary>
    public NodeUid? ParentNodeUid { get; } = parentNodeUid;
}
