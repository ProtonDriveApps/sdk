using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Api.Folders;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Api.Storage;
using Proton.Drive.Sdk.Api.Volumes;

namespace Proton.Drive.Sdk.Api;

internal interface IDriveApiClients
{
    IVolumesApiClient Volumes { get; }
    ISharesApiClient Shares { get; }
    ILinksApiClient Links { get; }
    IFoldersApiClient Folders { get; }
    IFilesApiClient Files { get; }
    IStorageApiClient Storage { get; }
    ITrashApiClient Trash { get; }
}
