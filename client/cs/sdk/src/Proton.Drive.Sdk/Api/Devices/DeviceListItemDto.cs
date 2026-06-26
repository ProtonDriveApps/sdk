namespace Proton.Drive.Sdk.Api.Devices;

internal sealed class DeviceListItemDto
{
    public required DeviceDataDto Device { get; init; }

    public required DeviceShareDataDto Share { get; init; }
}
