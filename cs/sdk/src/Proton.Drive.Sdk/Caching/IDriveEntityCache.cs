using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Caching;

internal interface IDriveEntityCache
{
    ValueTask SetMainVolumeIdAsync(VolumeId volumeId, CancellationToken cancellationToken);
    ValueTask<VolumeId?> TryGetMainVolumeIdAsync(CancellationToken cancellationToken);
}
