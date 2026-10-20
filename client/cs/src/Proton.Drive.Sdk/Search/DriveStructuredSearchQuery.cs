using ProtonDriveNodeUid = Proton.Drive.Sdk.Nodes.NodeUid;

namespace Proton.Drive.Sdk.Search;

/// <summary>
/// Structured search filters applied together with a name match.
/// </summary>
public sealed record DriveStructuredSearchQuery
{
    public string Name { get; init; } = string.Empty;

    public ProtonDriveNodeUid? ParentUid { get; init; }

    public string? MediaType { get; init; }

    public string? CreatedBy { get; init; }

    public string? OwnedBy { get; init; }

    public DriveSearchDateRange? CreationTime { get; init; }

    public DriveSearchDateRange? ModificationTime { get; init; }

    public DriveSearchDateRange? LastAccessTime { get; init; }

    public DriveSearchSizeRange? Size { get; init; }
}
