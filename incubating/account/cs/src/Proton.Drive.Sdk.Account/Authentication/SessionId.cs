using System.Text.Json.Serialization;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Account.Authentication;

[JsonConverter(typeof(StrongIdJsonConverter<SessionId>))]
public readonly record struct SessionId : IStrongId<SessionId>
{
    private readonly string? _value;

    internal SessionId(string value)
    {
        ArgumentException.ThrowIfNullOrEmpty(value);

        _value = value;
    }

    public static explicit operator SessionId(string value)
    {
        return new SessionId(value);
    }

    public override string ToString()
    {
        return !string.IsNullOrEmpty(_value) ? _value : throw new InvalidOperationException("ID is not initialized");
    }
}
