using System.Buffers;
using System.Diagnostics;
using System.Net;
using System.Security.Cryptography;
using Microsoft.Extensions.Logging;
using Microsoft.IO;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Cryptography;
using Proton.Drive.Sdk.Nodes.Upload.Verification;
using Proton.Sdk;
using Proton.Sdk.Addresses;
using Proton.Sdk.Api;
using Proton.Sdk.Drive;

namespace Proton.Drive.Sdk.Nodes.Upload;

internal sealed partial class BlockUploader
{
    private readonly ProtonDriveClient _client;
    private readonly ILogger _logger;

    internal BlockUploader(ProtonDriveClient client, int maxDegreeOfParallelism)
    {
        _client = client;
        _logger = client.Telemetry.GetLogger("Block uploader");

        Queue = new TransferQueue(maxDegreeOfParallelism, client.Telemetry.GetLogger("Block uploader queue"));
    }

    public TransferQueue Queue { get; }

    public async Task<BlockUploadResult> UploadContentAsync(
        RevisionUid revisionUid,
        int index,
        PgpSessionKey contentKey,
        PgpPrivateKey signingKey,
        AddressId membershipAddressId,
        PgpKey signatureEncryptionKey,
        Stream plainDataStream,
        IBlockVerifier verifier,
        byte[] plainDataPrefix,
        int plainDataPrefixLength,
        Action<long>? onBlockProgress,
        Action<int> releaseBlocksAction,
        CancellationToken cancellationToken)
    {
        try
        {
            try
            {
                var plainDataLength = plainDataStream.Length;

                var dataPacketStream = ProtonDriveClient.MemoryStreamManager.GetStream();
                await using (dataPacketStream.ConfigureAwait(false))
                {
                    var signatureStream = ProtonDriveClient.MemoryStreamManager.GetStream();

                    await using (signatureStream.ConfigureAwait(false))
                    {
                        BlockUploadResult result;

                        await using (plainDataStream.ConfigureAwait(false))
                        {
                            using var sha256 = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);

                            var hashingStream = new HashingWriteStream(dataPacketStream, sha256, leaveOpen: true);

                            await using (hashingStream.ConfigureAwait(false))
                            {
                                var signatureEncryptingStream = signatureEncryptionKey.OpenEncryptingStream(signatureStream);

                                await using (signatureEncryptingStream.ConfigureAwait(false))
                                {
                                    var pgpProfile = contentKey.IsAead() ? PgpProfile.ProtonAead : PgpProfile.Proton;
                                    var encryptingStream = contentKey.OpenEncryptingAndSigningStream(hashingStream, signatureEncryptingStream, signingKey, profile: pgpProfile, aeadStreamingChunkLength: PgpAeadStreamingChunkLength.ChunkLength);

                                    await using (encryptingStream.ConfigureAwait(false))
                                    {
                                        await plainDataStream.CopyToAsync(encryptingStream, cancellationToken).ConfigureAwait(false);
                                    }
                                }
                            }

                            var sha256Digest = sha256.GetCurrentHash();

                            result = new BlockUploadResult((int)plainDataStream.Length, sha256Digest, IsFileContent: true);
                        }

                        // The signature stream should not be closed until the signature is no longer needed, because the underlying buffer could be re-used,
                        // leading to a garbage signature.
                        var signature = signatureStream.GetBuffer().AsMemory()[..(int)signatureStream.Length];

                        // FIXME: retry upon verification failure

                        const long AeadChunkSize =
                            1 + // packet header: packet type
                            1 + // packet header: partial length
                            4 + // SEIPDv2 header: packet version, cipher ID, algo Id, chunk size
                            32 + // SEIPDv2 header: salt
                            PgpAeadStreamingChunkLength.ChunkLength +
                            1 + // chunk size header
                            36 + // end of chunk
                            16; // Aead Tag

                        var verificationToken = verifier.VerifyBlock(dataPacketStream.GetFirstBytes(AeadChunkSize), plainDataPrefix.AsSpan()[..plainDataPrefixLength]);

                        var request = new BlockUploadPreparationRequest
                        {
                            VolumeId = revisionUid.NodeUid.VolumeId,
                            LinkId = revisionUid.NodeUid.LinkId,
                            RevisionId = revisionUid.RevisionId,
                            AddressId = membershipAddressId,
                            Blocks =
                            [
                                new BlockCreationRequest
                                {
                                    Index = index,
                                    Size = (int)dataPacketStream.Length,
                                    HashDigest = result.Sha256Digest,
                                    EncryptedSignature = signature,
                                    VerificationOutput = new BlockVerificationOutput { Token = verificationToken.AsReadOnlyMemory() },
                                },
                            ],
                            Thumbnails = [],
                        };

                        await UploadBlobAsync(request, dataPacketStream, cancellationToken).ConfigureAwait(false);

                        onBlockProgress?.Invoke(plainDataLength);

                        LogContentBlobUploaded(index, revisionUid);

                        return result;
                    }
                }
            }
            finally
            {
                try
                {
                    Queue.FinishBlocks(1);
                }
                finally
                {
                    releaseBlocksAction.Invoke(1);
                }
            }
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(plainDataPrefix);
        }
    }

    public async Task<BlockUploadResult> UploadThumbnailAsync(
        RevisionUid revisionUid,
        PgpSessionKey contentKey,
        PgpPrivateKey signingKey,
        AddressId membershipAddressId,
        Thumbnail thumbnail,
        CancellationToken cancellationToken)
    {
        try
        {
            var dataPacketStream = ProtonDriveClient.MemoryStreamManager.GetStream();
            await using (dataPacketStream.ConfigureAwait(false))
            {
                using var sha256 = SHA256.Create();

                var hashingStream = new CryptoStream(dataPacketStream, sha256, CryptoStreamMode.Write, leaveOpen: true);

                await using (hashingStream.ConfigureAwait(false))
                {
                    var pgpProfile = contentKey.IsAead() ? PgpProfile.ProtonAead : PgpProfile.Proton;
                    var encryptingStream = contentKey.OpenEncryptingAndSigningStream(hashingStream, signingKey, profile: pgpProfile, aeadStreamingChunkLength: PgpAeadStreamingChunkLength.ChunkLength);

                    await using (encryptingStream.ConfigureAwait(false))
                    {
                        await encryptingStream.WriteAsync(thumbnail.Content, cancellationToken).ConfigureAwait(false);
                    }
                }

                var sha256Digest = sha256.Hash ?? [];

                var request = new BlockUploadPreparationRequest
                {
                    VolumeId = revisionUid.NodeUid.VolumeId,
                    LinkId = revisionUid.NodeUid.LinkId,
                    RevisionId = revisionUid.RevisionId,
                    AddressId = membershipAddressId,
                    Blocks = [],
                    Thumbnails =
                    [
                        new ThumbnailCreationRequest
                        {
                            Size = (int)dataPacketStream.Length,
                            Type = (Api.Files.ThumbnailType)thumbnail.Type,
                            HashDigest = sha256Digest,
                        },
                    ],
                };

                await UploadBlobAsync(request, dataPacketStream, cancellationToken).ConfigureAwait(false);

                LogThumbnailBlobUploaded(revisionUid);

                return new BlockUploadResult(0, sha256Digest, IsFileContent: false);
            }
        }
        finally
        {
            try
            {
                Queue.FinishBlocks(1);
            }
            finally
            {
                _client.RevisionCreationSemaphore.Release(1);
            }
        }
    }

    private async ValueTask UploadBlobAsync(
        BlockUploadPreparationRequest request,
        RecyclableMemoryStream dataPacketStream,
        CancellationToken cancellationToken)
    {
#pragma warning disable S3236 // FP: https://community.sonarsource.com/t/false-positive-on-s3236-when-calling-debug-assert-with-message/138761/6
        Debug.Assert(request.Thumbnails.Count + request.Blocks.Count == 1, "Block upload request should be for only one block, content or thumbnail");
#pragma warning restore S3236 // Caller information arguments should not be provided explicitly

        var remainingNumberOfAttempts = 2;

        while (remainingNumberOfAttempts >= 1)
        {
            try
            {
                // FIXME: request multiple blocks at once
                var uploadRequestResponse = await _client.Api.Files.PrepareBlockUploadAsync(request, cancellationToken).ConfigureAwait(false);

                var uploadTarget = request.Thumbnails.Count == 0 ? uploadRequestResponse.UploadTargets[0] : uploadRequestResponse.ThumbnailUploadTargets[0];

                dataPacketStream.Seek(0, SeekOrigin.Begin);

                await _client.Api.Storage.UploadBlobAsync(uploadTarget.BareUrl, uploadTarget.Token, dataPacketStream, cancellationToken)
                    .ConfigureAwait(false);

                remainingNumberOfAttempts = 0;
            }
            catch (Exception e) when ((UrlExpired(e) || BlobAlreadyUploaded(e)) && remainingNumberOfAttempts >= 2)
            {
                var revisionUid = new RevisionUid(request.VolumeId, request.LinkId, request.RevisionId);

                LogBlobUploadFailure(e, request.Blocks[0].Index, revisionUid, remainingNumberOfAttempts);

                --remainingNumberOfAttempts;
            }
        }

        return;

        static bool UrlExpired(Exception e) => e is HttpRequestException { StatusCode: HttpStatusCode.NotFound };

        // This can happen if the previous successful upload response was not received/processed,
        // which could happen for instance if the connection was interrupted just as the success was being sent back.
        // The HTTP client's resilience logic will kick in and retry the blob upload at the same URL
        // without handing control back to register a new block at the same index with its own new URL,
        // causing the back-end to reject the upload with this error.
        static bool BlobAlreadyUploaded(Exception e) => e is ProtonApiException { Code: ResponseCode.AlreadyExists };
    }

    [LoggerMessage(Level = LogLevel.Trace, Message = "Uploaded blob for content block #{BlockIndex} for revision \"{RevisionUid}\"")]
    private partial void LogContentBlobUploaded(int blockIndex, RevisionUid revisionUid);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Uploaded blob for thumbnail block of revision \"{RevisionUid}\"")]
    private partial void LogThumbnailBlobUploaded(RevisionUid revisionUid);

    [LoggerMessage(
        Level = LogLevel.Warning,
        Message = "Blob upload failed for block #{BlockIndex} for revision \"{RevisionUid}\" (remaining attempts: {RemainingAttempts}")]
    private partial void LogBlobUploadFailure(Exception exception, int blockIndex, RevisionUid revisionUid, int remainingAttempts);
}
