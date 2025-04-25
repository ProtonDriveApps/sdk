namespace Proton.Drive.Sdk.Nodes.Upload.Verification;

public readonly struct VerificationToken
{
    private readonly ReadOnlyMemory<byte> _data;

    private VerificationToken(ReadOnlyMemory<byte> data)
    {
        _data = data;
    }

    public static VerificationToken Create(ReadOnlySpan<byte> verificationCode, ReadOnlySpan<byte> dataPacketPrefix)
    {
        // In the unlikely event that the back-end decides to increase the length of the verification code such that it may exceed
        // the length of the data packet prefix, we have padding logic to deal with it, as per the agreed verification protocol.
        var dataPacketPrefixForToken = GetPaddedOrTruncatedBytes(dataPacketPrefix, verificationCode.Length);

        return new VerificationToken(BitwiseOperations.Xor(verificationCode, dataPacketPrefixForToken));
    }

    public ReadOnlyMemory<byte> AsReadOnlyMemory() => _data;

    private static ReadOnlySpan<byte> GetPaddedOrTruncatedBytes(ReadOnlySpan<byte> originalBytes, int length)
    {
        if (originalBytes.Length >= length)
        {
            return originalBytes[..length];
        }

        var result = new byte[length];
        originalBytes.CopyTo(result);
        return result;
    }
}
