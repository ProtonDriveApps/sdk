using CommunityToolkit.HighPerformance;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.BlockVerification;
using Proton.Drive.Sdk.Api.Files;

namespace Proton.Drive.Sdk.Nodes.Upload.Verification;

internal sealed class BlockVerifier : IBlockVerifier
{
    private const int MaxVerificationLength = 16;

    private readonly PgpSessionKey _sessionKey;
    private readonly ReadOnlyMemory<byte> _verificationCode;

    private BlockVerifier(PgpSessionKey sessionKey, ReadOnlyMemory<byte> verificationCode)
    {
        _sessionKey = sessionKey;
        _verificationCode = verificationCode;
    }

    public int DataPacketPrefixMaxLength => _verificationCode.Length;

    public static async ValueTask<BlockVerifier> CreateAsync(
        IRevisionVerificationApiClient apiClient,
        NodeUid fileUid,
        RevisionId revisionId,
        PgpPrivateKey key,
        CancellationToken cancellationToken)
    {
        var verificationInput =
            await apiClient.GetVerificationInputAsync(fileUid.VolumeId, fileUid.LinkId, revisionId, cancellationToken).ConfigureAwait(false);

        PgpSessionKey sessionKey;
        try
        {
            sessionKey = key.DecryptSessionKey(verificationInput.ContentKeyPacket.Span);
        }
        catch (Exception e)
        {
            throw new NodeKeyAndSessionKeyMismatchException(e);
        }

        return new BlockVerifier(sessionKey, verificationInput.VerificationCode);
    }

    public VerificationToken VerifyBlock(ReadOnlyMemory<byte> dataPacketPrefix, ReadOnlySpan<byte> plainDataPrefix)
    {
        try
        {
            var verificationLength = Math.Min(MaxVerificationLength, plainDataPrefix.Length);
            using var decryptingStream = _sessionKey.OpenDecryptingStream(dataPacketPrefix.AsStream());

            Span<byte> buffer = stackalloc byte[verificationLength];

            var numberOfBytesRead = decryptingStream.Read(buffer);
            if (!plainDataPrefix.StartsWith(buffer[..numberOfBytesRead]))
            {
                throw new SessionKeyAndDataPacketMismatchException();
            }
        }
        catch
        {
            throw new SessionKeyAndDataPacketMismatchException();
        }

        return VerificationToken.Create(_verificationCode.Span, dataPacketPrefix.Span);
    }
}
