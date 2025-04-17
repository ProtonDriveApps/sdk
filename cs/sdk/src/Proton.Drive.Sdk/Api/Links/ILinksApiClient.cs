using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Api.Links;

internal interface ILinksApiClient
{
    ValueTask<LinkDetailsResponse> GetLinkDetailsAsync(VolumeId volumeId, IEnumerable<LinkId> linkIds, CancellationToken cancellationToken);

    ValueTask<ContextShareResponse> GetContextShareAsync(VolumeId volumeId, LinkId linkId, CancellationToken cancellationToken);
}
