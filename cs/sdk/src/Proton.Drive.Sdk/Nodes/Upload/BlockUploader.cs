using System.Buffers;
using System.Diagnostics;
using System.Net;
using System.Security.Cryptography;
using Microsoft.IO;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Nodes.Upload.Verification;
using Proton.Sdk;
using Proton.Sdk.Addresses;
using Proton.Sdk.Api;
using Proton.Sdk.Drive;

namespace Proton.Drive.Sdk.Nodes.Upload;

internal sealed class BlockUploader
{
    private readonly ProtonDriveClient _client;

    internal BlockUploader(ProtonDriveClient client, int maxDegreeOfParallelism)
    {
        _client = client;
        MaxDegreeOfParallelism = maxDegreeOfParallelism;
        BlockSemaphore = new SemaphoreSlim(maxDegreeOfParallelism, maxDegreeOfParallelism);
    }

    public int MaxDegreeOfParallelism { get; }

    public SemaphoreSlim FileSemaphore { get; } = new(1, 1);
    public SemaphoreSlim BlockSemaphore { get; }

    public async Task<byte[]> UploadContentAsync(
        NodeUid fileUid,
        RevisionId revisionId,
        int index,
        PgpSessionKey contentKey,
        PgpPrivateKey signingKey,
        AddressId membershipAddressId,
        PgpKey signatureEncryptionKey,
        Stream plainDataStream,
        BlockVerifier verifier,
        byte[] plainDataPrefix,
        int plainDataPrefixLength,
        Action<long> onBlockProgress,
        Action<int> releaseBlocksAction,
        CancellationToken cancellationToken)
    {
        try
        {
            try
            {
                var dataPacketStream = ProtonDriveClient.MemoryStreamManager.GetStream();
                await using (dataPacketStream.ConfigureAwait(false))
                {
                    var signatureStream = ProtonDriveClient.MemoryStreamManager.GetStream();

                    await using (signatureStream.ConfigureAwait(false))
                    {
                        byte[] sha256Digest;

                        await using (plainDataStream.ConfigureAwait(false))
                        {
                            using var sha256 = SHA256.Create();

                            var hashingStream = new CryptoStream(dataPacketStream, sha256, CryptoStreamMode.Write, leaveOpen: true);

                            await using (hashingStream.ConfigureAwait(false))
                            {
                                var signatureEncryptingStream = signatureEncryptionKey.OpenEncryptingStream(signatureStream);

                                await using (signatureEncryptingStream.ConfigureAwait(false))
                                {
                                    var encryptingStream = contentKey.OpenEncryptingAndSigningStream(hashingStream, signatureEncryptingStream, signingKey);

                                    await using (encryptingStream.ConfigureAwait(false))
                                    {
                                        await plainDataStream.CopyToAsync(encryptingStream, cancellationToken).ConfigureAwait(false);
                                    }
                                }
                            }

                            sha256Digest = sha256.Hash ?? [];
                        }

                        // The signature stream should not be closed until the signature is no longer needed, because the underlying buffer could be re-used,
                        // leading to a garbage signature.
                        var signature = signatureStream.GetBuffer().AsMemory()[..(int)signatureStream.Length];

                        // FIXME: retry upon verification failure
                        var verificationToken = verifier.VerifyBlock(dataPacketStream.GetFirstBytes(128), plainDataPrefix.AsSpan()[..plainDataPrefixLength]);

                        var parameters = new BlockUploadRequestParameters
                        {
                            VolumeId = fileUid.VolumeId,
                            LinkId = fileUid.LinkId,
                            RevisionId = revisionId,
                            AddressId = membershipAddressId,
                            Blocks =
                            [
                                new BlockCreationParameters
                            {
                                Index = index,
                                Size = (int)dataPacketStream.Length,
                                HashDigest = sha256Digest,
                                EncryptedSignature = signature,
                                VerificationOutput = new BlockVerificationOutput { Token = verificationToken.AsReadOnlyMemory() },
                            },
                        ],
                            Thumbnails = [],
                        };

                        await UploadBlobAsync(parameters, dataPacketStream, onBlockProgress, cancellationToken).ConfigureAwait(false);

                        return sha256Digest;
                    }
                }
            }
            finally
            {
                try
                {
                    BlockSemaphore.Release();
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

    public async Task<byte[]> UploadThumbnailAsync(
        NodeUid fileUid,
        RevisionId revisionId,
        PgpSessionKey contentKey,
        PgpPrivateKey signingKey,
        AddressId membershipAddressId,
        FileSample sample,
        Action<long>? onProgress,
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
                    var encryptingStream = contentKey.OpenEncryptingAndSigningStream(hashingStream, signingKey);

                    await using (encryptingStream.ConfigureAwait(false))
                    {
                        await encryptingStream.WriteAsync(sample.Content, cancellationToken).ConfigureAwait(false);
                    }
                }

                var sha256Digest = sha256.Hash ?? [];

                var parameters = new BlockUploadRequestParameters
                {
                    VolumeId = fileUid.VolumeId,
                    LinkId = fileUid.LinkId,
                    RevisionId = revisionId,
                    AddressId = membershipAddressId,
                    Blocks = [],
                    Thumbnails =
                    [
                        new ThumbnailCreationParameters
                        {
                            Size = (int)dataPacketStream.Length,
                            Type = (ThumbnailType)sample.Purpose,
                            HashDigest = sha256Digest,
                        },
                    ],
                };

                await UploadBlobAsync(parameters, dataPacketStream, onProgress, cancellationToken).ConfigureAwait(false);

                return sha256Digest;
            }
        }
        finally
        {
            _client.RevisionCreationSemaphore.Release(1);
        }
    }

    private async ValueTask UploadBlobAsync(
        BlockUploadRequestParameters parameters,
        RecyclableMemoryStream dataPacketStream,
        Action<long>? onProgress,
        CancellationToken cancellationToken)
    {
#pragma warning disable S3236 // FP: https://community.sonarsource.com/t/false-positive-on-s3236-when-calling-debug-assert-with-message/138761/6
        Debug.Assert(parameters.Thumbnails.Count + parameters.Blocks.Count == 1, "Block upload request should be for only one block, content or thumbnail");
#pragma warning restore S3236 // Caller information arguments should not be provided explicitly

        var remainingNumberOfAttempts = 2;

        while (remainingNumberOfAttempts >= 1)
        {
            try
            {
                // FIXME: request multiple blocks at once
                var uploadRequestResponse = await _client.Api.Files.RequestBlockUploadAsync(parameters, cancellationToken).ConfigureAwait(false);

                var uploadTarget = parameters.Thumbnails.Count == 0 ? uploadRequestResponse.UploadTargets[0] : uploadRequestResponse.ThumbnailUploadTargets[0];

                dataPacketStream.Seek(0, SeekOrigin.Begin);

                await _client.Api.Storage.UploadBlobAsync(uploadTarget.BareUrl, uploadTarget.Token, dataPacketStream, onProgress, cancellationToken)
                    .ConfigureAwait(false);

                remainingNumberOfAttempts = 0;
            }
            catch (Exception e) when ((UrlExpired(e) || BlobAlreadyUploaded(e)) && remainingNumberOfAttempts >= 2)
            {
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
}
