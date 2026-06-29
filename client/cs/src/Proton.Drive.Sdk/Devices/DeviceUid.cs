using System.Text.Json.Serialization;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Devices;

[JsonConverter(typeof(StrongIdJsonConverter<DeviceUid>))]
public readonly record struct DeviceUid : IStrongId<DeviceUid>
{
    private readonly string? _value;

    internal DeviceUid(string value)
    {
        ArgumentException.ThrowIfNullOrEmpty(value);

        _value = value;
    }

    public static explicit operator DeviceUid(string value) => new(value);

    public static DeviceUid Parse(string value) => new(value);

    public override string ToString()
    {
        return !string.IsNullOrEmpty(_value) ? _value : throw new InvalidOperationException("UID is not initialized");
    }
}
