using System.Text.Json.Serialization;
using Proton.Sdk.Serialization;

namespace Proton.Sdk.Users;

[JsonConverter(typeof(StrongIdJsonConverter<UserId>))]
public readonly record struct UserId : IStrongId<UserId>
{
    private readonly string? _value;

    internal UserId(string? value)
    {
        _value = value;
    }

    public static explicit operator UserId(string? value)
    {
        return new UserId(value);
    }

    public override string ToString()
    {
        return _value ?? string.Empty;
    }
}
