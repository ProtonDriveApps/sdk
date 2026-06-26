namespace Proton.Drive.Sdk.Api.Devices;

/// <summary>
/// Web clients only ever update the share, to remove the deprecated name. The <c>Device</c> fields are reserved
/// for desktop clients.
/// </summary>
internal sealed class DeviceUpdateRequest
{
    public required DeviceUpdateShareDto Share { get; init; }
}
