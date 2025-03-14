using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Volumes.Api;

internal sealed class VolumeCreationResponse : ApiResponse
{
    public required VolumeDto Volume { get; init; }
}
