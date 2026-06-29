using System.Text.Json.Serialization;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Devices;

[JsonConverter(typeof(StrongIdJsonConverter<DeviceId>))]
public readonly record struct DeviceId : IStrongId<DeviceId>
{
    private readonly string? _value;

    internal DeviceId(string value)
    {
        ArgumentException.ThrowIfNullOrEmpty(value);

        _value = value;
    }

    public static explicit operator DeviceId(string value) => new(value);

    public override string ToString()
    {
        return !string.IsNullOrEmpty(_value) ? _value : throw new InvalidOperationException("ID is not initialized");
    }
}
