using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Api.Volumes;

namespace Proton.Drive.Sdk.Api;

internal sealed class DriveApiClients(HttpClient httpClient) : IDriveApiClients
{
    public IVolumesApiClient Volumes { get; } = new VolumesApiClient(httpClient);
    public ISharesApiClient Shares { get; } = new SharesApiClient(httpClient);
    public ILinksApiClient Links { get; } = new LinksApiClient(httpClient);
}
