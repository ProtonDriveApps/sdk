using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Api.Folders;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Api.Storage;
using Proton.Drive.Sdk.Api.Volumes;

namespace Proton.Drive.Sdk.Api;

internal sealed class DriveApiClients(HttpClient httpClient) : IDriveApiClients
{
    public IVolumesApiClient Volumes { get; } = new VolumesApiClient(httpClient);
    public ISharesApiClient Shares { get; } = new SharesApiClient(httpClient);
    public ILinksApiClient Links { get; } = new LinksApiClient(httpClient);
    public IFoldersApiClient Folders { get; } = new FoldersApiClient(httpClient);
    public IFilesApiClient Files { get; } = new FilesApiClient(httpClient);
    public IStorageApiClient Storage { get; } = new StorageApiClient(httpClient);
    public ITrashApiClient Trash { get; } = new TrashApiClient(httpClient);
}
