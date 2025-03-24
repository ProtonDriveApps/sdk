using System.Text.Json.Serialization;
using Proton.Sdk.Serialization;

namespace Proton.Sdk.Events;

[JsonConverter(typeof(StrongIdJsonConverter<EventId>))]
public readonly record struct EventId : IStrongId<EventId>
{
    private readonly string? _value;

    internal EventId(string? value)
    {
        _value = value;
    }

    public static explicit operator EventId(string? value)
    {
        return new EventId(value);
    }

    public override string ToString()
    {
        return _value ?? string.Empty;
    }
}
