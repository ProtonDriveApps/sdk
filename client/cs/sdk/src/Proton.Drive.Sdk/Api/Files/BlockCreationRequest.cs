using System.Text.Json.Serialization;
using Proton.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class BlockCreationRequest
{
    public required int Index { get; init; }
    public required int Size { get; init; }

    [JsonPropertyName("EncSignature")]
    public required PgpArmoredMessage EncryptedSignature { get; init; }

    [JsonPropertyName("Hash")]
    public required ReadOnlyMemory<byte> HashDigest { get; init; }

    [JsonPropertyName("Verifier")]
    public required BlockVerificationOutput VerificationOutput { get; init; }
}
