using Proton.Cryptography.Pgp;

namespace Proton.Drive.Sdk.Cryptography;

internal static class PgpDefaults
{
    // This parameter will set the streaming block size for AEAD encryption. Increasing this
    // reduces the number of tags and slightly improves performance, at the cost of more memory
    // consumption during decryption, and encryption due to the verifier which must decrypt the
    // first chunk of the encrypted payload.
    public const int AeadStreamingChunkLength = 1 << 17; // bytes -> 128KiB block size for streaming

    public static int AeadDecryptionMinimumInputLength { get; } = PgpConfiguration.GetAeadDecryptionMinimumInputLength(AeadStreamingChunkLength);
}
