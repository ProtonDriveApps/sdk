using Proton.Drive.Sdk.Nodes;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Devices;

/// <summary>
/// Represents a device in the Proton Drive system with information about its type, name, creation time,
/// and synchronisation status.
/// </summary>
public sealed record Device
{
    /// <summary>Unique identifier for the device.</summary>
    public required DeviceUid Uid { get; init; }

    /// <summary>The type/platform of the device.</summary>
    public required DeviceType Type { get; init; }

    /// <summary>Device name, which may fail to decrypt or have invalid characters.</summary>
    public required Result<string, ProtonDriveError> Name { get; init; }

    /// <summary>Unique identifier of the device's root folder.</summary>
    public required NodeUid RootFolderUid { get; init; }

    /// <summary>When the device was created.</summary>
    public required DateTime CreationTime { get; init; }

    /// <summary>Last time the device synchronised data, if ever.</summary>
    public DateTime? LastSyncTime { get; init; }

    /// <summary>Identifier of the device's share.</summary>
#pragma warning disable S1133 // Deprecated on purpose; kept until Volume-based navigation lands.
    [Obsolete("To be removed once Volume-based navigation is implemented.")]
#pragma warning restore S1133
    public string ShareId { get; init; } = string.Empty;
}
