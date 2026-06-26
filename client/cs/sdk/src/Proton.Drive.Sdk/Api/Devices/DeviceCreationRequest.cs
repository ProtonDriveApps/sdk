namespace Proton.Drive.Sdk.Api.Devices;

internal sealed class DeviceCreationRequest
{
    public required DeviceCreationDeviceDto Device { get; init; }

    public required DeviceCreationShareDto Share { get; init; }

    public required DeviceCreationLinkDto Link { get; init; }
}
