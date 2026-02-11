using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Caching;

internal interface IPhotosEntityCache
{
    ValueTask SetPhotosVolumeIdAsync(VolumeId volumeId, CancellationToken cancellationToken);

    ValueTask SetPhotosShareIdAsync(ShareId shareId, CancellationToken cancellationToken);

    ValueTask<ShareId?> TryGetPhotosShareIdAsync(CancellationToken cancellationToken);
}
