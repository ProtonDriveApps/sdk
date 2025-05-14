using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Links;

internal interface ILinksApiClient
{
    ValueTask<LinkDetailsResponse> GetDetailsAsync(VolumeId volumeId, IEnumerable<LinkId> linkIds, CancellationToken cancellationToken);

    ValueTask<ContextShareResponse> GetContextShareAsync(VolumeId volumeId, LinkId linkId, CancellationToken cancellationToken);

    ValueTask<ApiResponse> MoveAsync(VolumeId volumeId, LinkId linkId, MoveSingleLinkRequest request, CancellationToken cancellationToken);

    ValueTask<ApiResponse> MoveMultipleAsync(VolumeId volumeId, MoveMultipleLinksRequest request, CancellationToken cancellationToken);

    ValueTask<ApiResponse> RenameAsync(VolumeId volumeId, LinkId linkId, RenameLinkRequest request, CancellationToken cancellationToken);
}
