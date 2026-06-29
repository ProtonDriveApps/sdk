using System.Text.Json.Serialization;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Events;

[JsonConverter(typeof(StrongIdJsonConverter<DriveEventId>))]
public readonly record struct DriveEventId : IStrongId<DriveEventId>
{
    private readonly string? _value;

    internal DriveEventId(string value)
    {
        ArgumentException.ThrowIfNullOrEmpty(value);

        _value = value;
    }

    public static explicit operator DriveEventId(string value)
    {
        return new DriveEventId(value);
    }

    public override string ToString()
    {
        return !string.IsNullOrEmpty(_value) ? _value : throw new InvalidOperationException("ID is not initialized");
    }
}
