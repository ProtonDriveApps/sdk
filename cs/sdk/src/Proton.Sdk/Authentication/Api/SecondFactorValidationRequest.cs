using System.Text.Json.Serialization;

namespace Proton.Sdk.Authentication.Api;

internal readonly struct SecondFactorValidationRequest(string secondFactorCode)
{
    [JsonPropertyName("TwoFactorCode")]
    public string SecondFactorCode => secondFactorCode;
}
