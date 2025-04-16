using System.Text.Json.Serialization;
using Proton.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Api.Links;

internal sealed class FileDto
{
    public required string MediaType { get; init; }

    [JsonPropertyName("TotalEncryptedSize")]
    public required long TotalStorageQuotaUsage { get; init; }

    public required ReadOnlyMemory<byte> ContentKeyPacket { get; init; }

    public PgpArmoredSignature ContentKeyPacketSignature { get; init; }

    public ActiveRevisionDto? ActiveRevision { get; init; }
}
