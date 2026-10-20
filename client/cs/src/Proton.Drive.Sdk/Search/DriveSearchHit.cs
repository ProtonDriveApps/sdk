using ProtonDriveNodeUid = Proton.Drive.Sdk.Nodes.NodeUid;

namespace Proton.Drive.Sdk.Search;

/// <summary>
/// A single local index search hit.
/// </summary>
public sealed record DriveSearchHit(ProtonDriveNodeUid NodeUid, double Score);
