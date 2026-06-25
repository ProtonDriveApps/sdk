namespace Proton.Drive.Sdk.Account.Api.Addresses;

[Flags]
public enum AddressKeyCapabilities
{
    None = 0,
    IsAllowedForSignatureVerification = 1,
    IsAllowedForEncryption = 2,
}
