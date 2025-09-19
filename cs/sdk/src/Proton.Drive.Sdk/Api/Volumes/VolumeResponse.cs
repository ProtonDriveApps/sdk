using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Volumes;

internal sealed class VolumeResponse : ApiResponse
{
    public required VolumeDetailsDto Volume { get; init; }
}
