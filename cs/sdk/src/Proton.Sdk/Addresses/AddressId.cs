using Proton.Sdk.Serialization;

namespace Proton.Sdk.Addresses;

public readonly record struct AddressId(string Value) : IStrongId<AddressId>
{
    public static implicit operator AddressId(string value)
    {
        return new AddressId(value);
    }
}
