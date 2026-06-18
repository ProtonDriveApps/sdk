using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Events;

public readonly struct DriveEventScopeId
{
    internal DriveEventScopeId(VolumeId volumeId)
    {
        VolumeId = volumeId;
    }

    internal VolumeId VolumeId { get; }

    public override string ToString()
    {
        return VolumeId.ToString();
    }
}
