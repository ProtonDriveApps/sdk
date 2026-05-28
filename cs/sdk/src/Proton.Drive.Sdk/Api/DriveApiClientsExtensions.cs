using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Api;

internal static class DriveApiClientsExtensions
{
    public static ValueTask<LinkDetailsResponse> GetLinkDetailsAsync(
        this IDriveApiClients api,
        VolumeId volumeId,
        IEnumerable<LinkId> linkIds,
        bool forPhotos,
        CancellationToken cancellationToken)
        => forPhotos
            ? api.Photos.GetDetailsAsync(volumeId, linkIds, cancellationToken)
            : api.Links.GetDetailsAsync(volumeId, linkIds, cancellationToken);
}
