using System.Text.Json.Serialization;
using Proton.Sdk.Serialization;

namespace Proton.Sdk.Authentication;

[JsonConverter(typeof(StrongIdJsonConverter<SessionId>))]
public readonly record struct SessionId : IStrongId<SessionId>
{
    private readonly string? _value;

    internal SessionId(string? value)
    {
        _value = value;
    }

    public static explicit operator SessionId(string? value)
    {
        return new SessionId(value);
    }

    public override string ToString()
    {
        return _value ?? string.Empty;
    }
}
