using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Devices;

internal sealed class DeviceListResponse : ApiResponse
{
    public required IReadOnlyList<DeviceListItemDto> Devices { get; init; }
}
