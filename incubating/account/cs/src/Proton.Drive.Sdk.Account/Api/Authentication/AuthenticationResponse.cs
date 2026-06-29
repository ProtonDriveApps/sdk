using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Account.Authentication;
using Proton.Drive.Sdk.Account.Users;
using Proton.Drive.Sdk.Events;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Account.Api.Authentication;

internal sealed class AuthenticationResponse : ApiResponse
{
    [JsonPropertyName("UID")]
    public required SessionId SessionId { get; init; }

    [JsonPropertyName("UserID")]
    public required UserId UserId { get; init; }

    [JsonPropertyName("EventID")]
    public DriveEventId? EventId { get; init; }

    public required ReadOnlyMemory<byte> ServerProof { get; init; }

    public required string TokenType { get; init; }

    public required string AccessToken { get; init; }

    public required string RefreshToken { get; init; }

    public required IReadOnlyList<string> Scopes { get; init; }

    public required PasswordMode PasswordMode { get; init; }

    [JsonPropertyName("2FA")]
    public SecondFactorParameters? SecondFactorParameters { get; init; }
}
