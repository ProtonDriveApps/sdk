namespace Proton.Drive.Sdk.Nodes.Upload.Verification;

public interface IBlockVerifier
{
    int DataPacketPrefixMaxLength { get; }

    VerificationToken VerifyBlock(ReadOnlyMemory<byte> dataPacketPrefix, ReadOnlySpan<byte> plainDataPrefix);
}
