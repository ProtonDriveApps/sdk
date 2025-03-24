namespace Proton.Sdk.Addresses;

public static class AddressExtensions
{
    public static AddressKey GetPrimaryKey(this Address address)
    {
        return address.Keys[address.PrimaryKeyIndex];
    }
}
