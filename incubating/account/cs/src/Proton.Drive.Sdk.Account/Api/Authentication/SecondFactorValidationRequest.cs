using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Account.Api.Authentication;

internal readonly struct SecondFactorValidationRequest(string secondFactorCode)
{
    [JsonPropertyName("TwoFactorCode")]
    public string SecondFactorCode => secondFactorCode;
}
