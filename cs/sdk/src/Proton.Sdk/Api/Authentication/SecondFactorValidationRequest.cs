using System.Text.Json.Serialization;

namespace Proton.Sdk.Api.Authentication;

internal readonly struct SecondFactorValidationRequest(string secondFactorCode)
{
    [JsonPropertyName("TwoFactorCode")]
    public string SecondFactorCode => secondFactorCode;
}
