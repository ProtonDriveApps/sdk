using Proton.Sdk.Serialization;

namespace Proton.Sdk.Addresses.Api;

public readonly record struct AddressKeyId(string Value) : IStrongId<AddressKeyId>
{
    public static implicit operator AddressKeyId(string value)
    {
        return new AddressKeyId(value);
    }
}
