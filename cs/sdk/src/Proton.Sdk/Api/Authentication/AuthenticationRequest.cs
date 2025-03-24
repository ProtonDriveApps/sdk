using System.Text.Json.Serialization;

namespace Proton.Sdk.Api.Authentication;

internal sealed class AuthenticationRequest
{
    public required string Username { get; init; }

    public required ReadOnlyMemory<byte> ClientEphemeral { get; init; }

    public required ReadOnlyMemory<byte> ClientProof { get; init; }

    [JsonPropertyName("SRPSession")]
    public required string SrpSessionId { get; init; }

    [JsonPropertyName("TwoFactorCode")]
    public string? SecondFactorCode { get; init; }
}
