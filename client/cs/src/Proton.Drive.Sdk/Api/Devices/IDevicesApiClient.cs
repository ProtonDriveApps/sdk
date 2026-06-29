using Proton.Drive.Sdk.Devices;

namespace Proton.Drive.Sdk.Api.Devices;

internal interface IDevicesApiClient
{
    ValueTask<DeviceListResponse> GetDevicesAsync(CancellationToken cancellationToken);
    ValueTask<DeviceCreationResponse> CreateDeviceAsync(DeviceCreationRequest request, CancellationToken cancellationToken);
    ValueTask RemoveNameFromDeviceAsync(DeviceUid deviceUid, CancellationToken cancellationToken);
    ValueTask DeleteDeviceAsync(DeviceUid deviceUid, CancellationToken cancellationToken);
}
