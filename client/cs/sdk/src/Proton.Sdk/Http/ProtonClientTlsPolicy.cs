namespace Proton.Sdk.Http;

public enum ProtonClientTlsPolicy
{
    Strict = 0,
    NoCertificatePinning = 1,
    NoCertificateValidation = 2,
}
