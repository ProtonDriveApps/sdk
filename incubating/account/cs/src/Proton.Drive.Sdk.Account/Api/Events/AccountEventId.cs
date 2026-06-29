using System.Text.Json.Serialization;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Account.Api.Events;

[JsonConverter(typeof(StrongIdJsonConverter<AccountEventId>))]
public readonly record struct AccountEventId : IStrongId<AccountEventId>
{
    private readonly string? _value;

    internal AccountEventId(string value)
    {
        ArgumentException.ThrowIfNullOrEmpty(value);

        _value = value;
    }

    public static explicit operator AccountEventId(string value)
    {
        return new AccountEventId(value);
    }

    public override string ToString()
    {
        return !string.IsNullOrEmpty(_value) ? _value : throw new InvalidOperationException("ID is not initialized");
    }
}
