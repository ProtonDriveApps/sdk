using System.Security.Cryptography;

namespace Proton.Sdk.Cryptography;

internal static class CryptoSecureNumberGenerator
{
    public static void Fill(byte[] buffer)
    {
        RandomNumberGenerator.Fill(buffer);
    }

    public static byte[] GetBytes(int count)
    {
        return RandomNumberGenerator.GetBytes(count);
    }
}
