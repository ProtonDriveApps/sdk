namespace Proton.Sdk.Keys.Api;

[Flags]
internal enum PublicKeyStatus
{
    IsNotCompromised = 1,
    IsNotObsolete = 2,
}
