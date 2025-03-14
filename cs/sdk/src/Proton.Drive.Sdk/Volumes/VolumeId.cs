using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Volumes;

public readonly record struct VolumeId(string Value) : IStrongId<VolumeId>
{
    public static implicit operator VolumeId(string value)
    {
        return new VolumeId(value);
    }
}
