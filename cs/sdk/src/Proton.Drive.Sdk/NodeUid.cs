using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk;

public readonly record struct NodeUid
{
    internal NodeUid(VolumeId volumeId, LinkId linkId)
    {
        VolumeId = volumeId;
        LinkId = linkId;
    }

    internal VolumeId VolumeId { get; }
    internal LinkId LinkId { get; }

    public override string ToString()
    {
        return $"{VolumeId}~{LinkId}";
    }
}
