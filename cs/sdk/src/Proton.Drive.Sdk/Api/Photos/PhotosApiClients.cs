using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Api.Folders;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Api.Storage;
using Proton.Drive.Sdk.Api.Volumes;

namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class PhotosApiClients(HttpClient defaultHttpClient, HttpClient storageHttpClient) : IDriveApiClients
{
    public IVolumesApiClient Volumes { get; } = new VolumesApiClient(defaultHttpClient);
    public ISharesApiClient Shares { get; } = new SharesApiClient(defaultHttpClient);
    public ILinksApiClient Links { get; } = new PhotosLinksApiClient(defaultHttpClient);
    public IFoldersApiClient Folders { get; } = new FoldersApiClient(defaultHttpClient);
    public IFilesApiClient Files { get; } = new FilesApiClient(defaultHttpClient);
    public IStorageApiClient Storage { get; } = new StorageApiClient(defaultHttpClient, storageHttpClient);
    public ITrashApiClient Trash { get; } = new TrashApiClient(defaultHttpClient);
}
