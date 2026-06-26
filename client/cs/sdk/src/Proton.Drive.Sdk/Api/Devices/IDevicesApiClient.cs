using Proton.Drive.Sdk.Devices;

namespace Proton.Drive.Sdk.Api.Devices;

internal interface IDevicesApiClient
{
    ValueTask<DeviceListResponse> GetDevicesAsync(CancellationToken cancellationToken);
    ValueTask<DeviceCreationResponse> CreateDeviceAsync(DeviceCreationRequest request, CancellationToken cancellationToken);
    ValueTask RemoveNameFromDeviceAsync(DeviceId deviceId, CancellationToken cancellationToken);
    ValueTask DeleteDeviceAsync(DeviceId deviceId, CancellationToken cancellationToken);
}
