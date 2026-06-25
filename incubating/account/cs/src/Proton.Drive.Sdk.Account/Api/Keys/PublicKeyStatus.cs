namespace Proton.Drive.Sdk.Account.Api.Keys;

[Flags]
internal enum PublicKeyStatus
{
    IsNotCompromised = 1,
    IsNotObsolete = 2,
}
