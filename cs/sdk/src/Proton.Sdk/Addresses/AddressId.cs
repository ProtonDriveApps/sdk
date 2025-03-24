using System.Text.Json.Serialization;
using Proton.Sdk.Serialization;

namespace Proton.Sdk.Addresses;

[JsonConverter(typeof(StrongIdJsonConverter<AddressId>))]
public readonly record struct AddressId : IStrongId<AddressId>
{
    private readonly string? _value;

    internal AddressId(string? value)
    {
        _value = value;
    }

    public static explicit operator AddressId(string? value)
    {
        return new AddressId(value);
    }

    public override string ToString()
    {
        return _value ?? string.Empty;
    }
}
