using Proton.Drive.Sdk.Volumes.Api;

namespace Proton.Drive.Sdk.Api;

internal sealed class DriveApiClients(HttpClient httpClient) : IDriveApiClients
{
    public IVolumesApiClient Volumes { get; } = new VolumesApiClient(httpClient);
}
