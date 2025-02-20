namespace Proton.Sdk.Addresses.Api;

[Flags]
public enum AddressKeyCapabilities
{
    None = 0,
    IsAllowedForSignatureVerification = 1,
    IsAllowedForEncryption = 2,
}
