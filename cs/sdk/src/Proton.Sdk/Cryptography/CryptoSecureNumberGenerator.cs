using System.Security.Cryptography;

namespace Proton.Sdk.Cryptography;

public static class CryptoSecureNumberGenerator
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
