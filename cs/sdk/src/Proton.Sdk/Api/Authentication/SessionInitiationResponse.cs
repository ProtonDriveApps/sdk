using System.Text.Json.Serialization;

namespace Proton.Sdk.Api.Authentication;

internal sealed class SessionInitiationResponse : ApiResponse
{
    public required int Version { get; init; }

    // TODO: make this ReadOnlyMemory<byte>
    public required string Modulus { get; init; }

    public required ReadOnlyMemory<byte> ServerEphemeral { get; init; }

    public required ReadOnlyMemory<byte> Salt { get; init; }

    [JsonPropertyName("SRPSession")]
    public required string SrpSessionId { get; init; }
}
