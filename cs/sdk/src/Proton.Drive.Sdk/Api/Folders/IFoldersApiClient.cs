using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Api.Folders;

internal interface IFoldersApiClient
{
    Task<FolderChildrenResponse> GetChildrenAsync(
        VolumeId volumeId,
        LinkId linkId,
        LinkId? anchorId,
        CancellationToken cancellationToken);
}
