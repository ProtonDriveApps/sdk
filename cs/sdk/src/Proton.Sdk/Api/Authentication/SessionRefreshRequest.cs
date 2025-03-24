using System.Text.Json.Serialization;

namespace Proton.Sdk.Api.Authentication;

internal readonly struct SessionRefreshRequest(string refreshToken, string responseType, string grantType, Uri redirectUri)
{
    public string RefreshToken { get; } = refreshToken;

    [JsonInclude]
    public string ResponseType => responseType;

    public string GrantType => grantType;

    [JsonPropertyName("RedirectURI")]
    public Uri RedirectUri => redirectUri;
}
