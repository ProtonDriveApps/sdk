namespace Proton.Drive.Sdk.Cryptography;

internal static class PgpAeadStreamingChunkLength
{
    // This parameter will set the streaming block size for AEAD encryption. Increasing this
    // reduces the number of tags and slightly improves performance, at the cost of more memory
    // consumption during decryption, and encryption due to the verifier which must decrypt the
    // first chunk of the encrypted payload.
    public const long ChunkLength = 1 << 17; // bytes -> 128KiB block size for streaming
}
