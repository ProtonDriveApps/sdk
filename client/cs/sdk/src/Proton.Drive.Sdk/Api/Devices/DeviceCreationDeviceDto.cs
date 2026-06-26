using Proton.Drive.Sdk.Devices;

namespace Proton.Drive.Sdk.Api.Devices;

internal sealed class DeviceCreationDeviceDto
{
    public required DeviceType Type { get; init; }

    /// <summary>Synchronisation state. 0 = off when registering a new device.</summary>
    public int SyncState { get; init; }
}
