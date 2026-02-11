using System.Text.Json.Serialization;
using Proton.Sdk.Authentication;

namespace Proton.Sdk.Api.Authentication;

internal sealed class SessionRefreshResponse : ApiResponse
{
    public required string AccessToken { get; init; }

    public string? TokenType { get; init; }

    public required IReadOnlyList<string> Scopes { get; init; }

    [JsonPropertyName("UID")]
    public required SessionId SessionId { get; init; }

    public required string RefreshToken { get; init; }
}
