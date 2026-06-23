using System.Text.Json.Serialization;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Volumes;

[JsonConverter(typeof(StrongIdJsonConverter<VolumeId>))]
internal readonly record struct VolumeId : IStrongId<VolumeId>
{
    private readonly string? _value;

    internal VolumeId(string value)
    {
        ArgumentException.ThrowIfNullOrEmpty(value);

        _value = value;
    }

    public static explicit operator VolumeId(string value)
    {
        return new VolumeId(value);
    }

    public override string ToString()
    {
        return !string.IsNullOrEmpty(_value) ? _value : throw new InvalidOperationException("ID is not initialized");
    }
}
