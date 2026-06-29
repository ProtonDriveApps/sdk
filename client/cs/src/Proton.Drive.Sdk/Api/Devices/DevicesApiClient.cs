using Proton.Drive.Sdk.Devices;
using Proton.Drive.Sdk.Serialization;
using Proton.Sdk.Api;
using Proton.Sdk.Api.Http;

namespace Proton.Drive.Sdk.Api.Devices;

internal sealed class DevicesApiClient(HttpClient httpClient) : IDevicesApiClient
{
    private readonly HttpClient _httpClient = httpClient;

    public async ValueTask<DeviceListResponse> GetDevicesAsync(CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.DeviceListResponse)
            .GetAsync("devices", cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<DeviceCreationResponse> CreateDeviceAsync(DeviceCreationRequest request, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.DeviceCreationResponse)
            .PostAsync("devices", request, DriveApiSerializerContext.Default.DeviceCreationRequest, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask RemoveNameFromDeviceAsync(DeviceUid deviceUid, CancellationToken cancellationToken)
    {
        var request = new DeviceUpdateRequest { Share = new DeviceUpdateShareDto { Name = string.Empty } };

        await _httpClient
            .Expecting<ApiResponse>(DriveApiSerializerContext.Default.ApiResponse)
            .PutAsync($"devices/{deviceUid}", request, DriveApiSerializerContext.Default.DeviceUpdateRequest, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask DeleteDeviceAsync(DeviceUid deviceUid, CancellationToken cancellationToken)
    {
        await _httpClient
            .Expecting<ApiResponse>(DriveApiSerializerContext.Default.ApiResponse)
            .DeleteAsync($"devices/{deviceUid}", cancellationToken).ConfigureAwait(false);
    }
}
