using System.Text.Json.Serialization;
using Proton.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class FileDto
{
    public required string MediaType { get; init; }

    [JsonPropertyName("TotalEncryptedSize")]
    public required long TotalStorageQuotaUsage { get; init; }

    public required ReadOnlyMemory<byte> ContentKeyPacket { get; init; }

    [JsonPropertyName("ContentKeyPacketSignature")]
    public PgpArmoredSignature ContentKeySignature { get; init; }

    public ActiveRevisionDto? ActiveRevision { get; init; }
}
