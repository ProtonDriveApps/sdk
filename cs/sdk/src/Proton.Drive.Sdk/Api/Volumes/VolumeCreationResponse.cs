using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Volumes;

internal sealed class VolumeCreationResponse : ApiResponse
{
    public required VolumeDto Volume { get; init; }
}
