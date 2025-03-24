using System.Buffers.Text;
using System.Security.Cryptography;
using Proton.Cryptography.Pgp;

namespace Proton.Drive.Sdk.Cryptography;

internal static class CryptoGenerator
{
    private const int PassphraseMaxUtf8Length = ((PassphraseRandomBytesLength + 2) / 3) * 4;
    private const int PassphraseRandomBytesLength = 32;
    private const int FolderHashKeyLength = 32;

    public static int PassphraseBufferRequiredLength => PassphraseMaxUtf8Length;

    public static ReadOnlySpan<byte> GeneratePassphrase(Span<byte> buffer)
    {
        var randomBytes = buffer[..PassphraseRandomBytesLength];
        RandomNumberGenerator.Fill(randomBytes);
        Base64.EncodeToUtf8InPlace(buffer, PassphraseRandomBytesLength, out var length);
        return buffer[..length];
    }

    public static PgpPrivateKey GeneratePrivateKey()
    {
        return PgpPrivateKey.Generate("Drive key", "no-reply@proton.me", KeyGenerationAlgorithm.Default);
    }

    public static byte[] GenerateFolderHashKey()
    {
        var hashKeyBuffer = new byte[FolderHashKeyLength];
        RandomNumberGenerator.Fill(hashKeyBuffer);
        return hashKeyBuffer;
    }

    public static PgpSessionKey GenerateSessionKey()
    {
        return PgpSessionKey.Generate();
    }
}
