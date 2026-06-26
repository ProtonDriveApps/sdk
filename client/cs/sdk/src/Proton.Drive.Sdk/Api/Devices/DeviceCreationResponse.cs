using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Devices;

internal sealed class DeviceCreationResponse : ApiResponse
{
    public required DeviceCreationResultDto Device { get; init; }
}
