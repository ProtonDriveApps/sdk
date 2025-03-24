using System.Text.Json.Serialization;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Volumes;

[JsonConverter(typeof(StrongIdJsonConverter<VolumeId>))]
public readonly record struct VolumeId : IStrongId<VolumeId>
{
    private readonly string? _value;

    internal VolumeId(string? value)
    {
        _value = value;
    }

    public static explicit operator VolumeId(string? value)
    {
        return new VolumeId(value);
    }

    public override string ToString()
    {
        return _value ?? string.Empty;
    }
}
