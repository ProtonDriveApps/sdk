using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Api.Volumes;

namespace Proton.Drive.Sdk.Api;

internal interface IDriveApiClients
{
    IVolumesApiClient Volumes { get; }
    ISharesApiClient Shares { get; }
    ILinksApiClient Links { get; }
}
