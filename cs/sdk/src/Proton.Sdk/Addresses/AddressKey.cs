using Proton.Sdk.Addresses.Api;

namespace Proton.Sdk.Addresses;

public sealed class AddressKey(
    AddressId addressId,
    AddressKeyId addressKeyId,
    bool isPrimary,
    bool isActive,
    bool isAllowedForEncryption,
    bool isAllowedForVerification)
{
    public AddressId AddressId { get; } = addressId;
    public AddressKeyId AddressKeyId { get; } = addressKeyId;
    public bool IsPrimary { get; } = isPrimary;
    public bool IsActive { get; } = isActive;
    public bool IsAllowedForEncryption { get; } = isAllowedForEncryption;
    public bool IsAllowedForVerification { get; } = isAllowedForVerification;
}
