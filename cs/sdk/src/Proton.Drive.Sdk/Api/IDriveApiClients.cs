using Proton.Drive.Sdk.Volumes.Api;

namespace Proton.Drive.Sdk.Api;

internal interface IDriveApiClients
{
    IVolumesApiClient Volumes { get; }
}
