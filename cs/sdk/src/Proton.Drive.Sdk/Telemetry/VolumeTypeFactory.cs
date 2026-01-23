using Proton.Drive.Sdk.Api.Shares;

namespace Proton.Drive.Sdk.Telemetry;

internal static class VolumeTypeFactory
{
    internal static VolumeType FromShareType(ShareType shareType)
    {
        return shareType switch
        {
            ShareType.Main => VolumeType.OwnVolume,
            ShareType.Photos => VolumeType.OwnPhotoVolume,
            ShareType.Standard => VolumeType.Shared,
            ShareType.Device => VolumeType.OwnVolume,
            _ => throw new ArgumentOutOfRangeException(nameof(shareType), shareType, "Unknown share type"),
        };
    }
}
