using System.Text.Json.Serialization;
using Proton.Sdk.Serialization;

namespace Proton.Sdk.Addresses;

[JsonConverter(typeof(StrongIdJsonConverter<AddressKeyId>))]
public readonly record struct AddressKeyId : IStrongId<AddressKeyId>
{
    private readonly string? _value;

    internal AddressKeyId(string? value)
    {
        _value = value;
    }

    public static explicit operator AddressKeyId(string? value)
    {
        return new AddressKeyId(value);
    }

    public override string ToString()
    {
        return _value ?? string.Empty;
    }
}
