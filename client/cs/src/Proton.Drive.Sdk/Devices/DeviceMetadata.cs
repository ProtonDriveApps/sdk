using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;

namespace Proton.Drive.Sdk.Devices;

/// <summary>
/// Internal representation of a device, without its (decrypted) name.
/// </summary>
internal sealed class DeviceMetadata
{
    public required DeviceUid Id { get; init; }
    public required DeviceType Type { get; init; }
    public required NodeUid RootFolderUid { get; init; }
    public required DateTime CreationTime { get; init; }
    public DateTime? LastSyncTime { get; init; }

    /// <summary>
    /// Originally the device name was stored on the share of the device. This has been moved to the root node
    /// of the device. Old devices still have the name on the share, and it must be removed when renaming.
    /// </summary>
    public required bool HasDeprecatedName { get; init; }

    public required ShareId ShareId { get; init; }
}
