using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class FileCreationParameters : NodeCreationParameters
{
    [JsonPropertyName("MIMEType")]
    public required string MediaType { get; init; }

    public required ReadOnlyMemory<byte> ContentKeyPacket { get; init; }

    public required PgpArmoredSignature ContentKeyPacketSignature { get; init; }

    [JsonPropertyName("ClientUID")]
    public string? ClientUid { get; init; }

    public long? IntendedUploadSize { get; init; }
}
