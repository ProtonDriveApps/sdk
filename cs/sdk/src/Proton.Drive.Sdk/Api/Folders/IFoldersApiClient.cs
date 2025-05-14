using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Api.Folders;

internal interface IFoldersApiClient
{
    ValueTask<FolderChildrenResponse> GetChildrenAsync(VolumeId volumeId, LinkId linkId, LinkId? anchorId, CancellationToken cancellationToken);

    ValueTask<FolderCreationResponse> CreateFolderAsync(VolumeId volumeId, FolderCreationRequest request, CancellationToken cancellationToken);
}
