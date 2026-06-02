using System.Text.Json.Serialization;
using Proton.Sdk.Serialization;

namespace Proton.Sdk.Events;

[JsonConverter(typeof(StrongIdJsonConverter<DriveEventId>))]
public readonly record struct DriveEventId : IStrongId<DriveEventId>
{
    private readonly string? _value;

    internal DriveEventId(string? value)
    {
        _value = value;
    }

    public static explicit operator DriveEventId(string value)
    {
        return new DriveEventId(value);
    }

    public override string ToString()
    {
        return _value ?? string.Empty;
    }
}
