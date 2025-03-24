using System.Text.Json.Serialization;
using Proton.Sdk.Serialization;

namespace Proton.Sdk.Users;

[JsonConverter(typeof(StrongIdJsonConverter<UserKeyId>))]
public readonly record struct UserKeyId : IStrongId<UserKeyId>
{
    private readonly string? _value;

    internal UserKeyId(string? value)
    {
        _value = value;
    }

    public static explicit operator UserKeyId(string? value)
    {
        return new UserKeyId(value);
    }

    public override string ToString()
    {
        return _value ?? string.Empty;
    }
}
