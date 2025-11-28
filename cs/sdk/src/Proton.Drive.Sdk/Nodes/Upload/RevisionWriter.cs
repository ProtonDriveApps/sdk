using System.Buffers;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Cryptography;
using Proton.Drive.Sdk.Serialization;
using Proton.Drive.Sdk.Telemetry;
using Proton.Sdk.Addresses;

namespace Proton.Drive.Sdk.Nodes.Upload;

internal sealed partial class RevisionWriter : IDisposable
{
    public const int DefaultBlockSize = 1 << 22; // 4 MiB

    private readonly ProtonDriveClient _client;
    private readonly RevisionUid _revisionUid;
    private readonly PgpPrivateKey _fileKey;
    private readonly PgpSessionKey _contentKey;
    private readonly PgpPrivateKey _signingKey;
    private readonly Address _membershipAddress;
    private readonly Action<int> _releaseBlocksAction;
    private readonly Action _releaseFileSemaphoreAction;
    private readonly ILogger _logger;

    private readonly int _targetBlockSize;
    private readonly int _maxBlockSize;

    private bool _fileReleased;

    internal RevisionWriter(
        ProtonDriveClient client,
        RevisionUid revisionUid,
        PgpPrivateKey fileKey,
        PgpSessionKey contentKey,
        PgpPrivateKey signingKey,
        Address membershipAddress,
        Action<int> releaseBlocksAction,
        Action releaseFileSemaphoreAction,
        int targetBlockSize = DefaultBlockSize,
        int maxBlockSize = DefaultBlockSize)
    {
        _client = client;
        _revisionUid = revisionUid;
        _fileKey = fileKey;
        _contentKey = contentKey;
        _signingKey = signingKey;
        _membershipAddress = membershipAddress;
        _releaseBlocksAction = releaseBlocksAction;
        _releaseFileSemaphoreAction = releaseFileSemaphoreAction;
        _targetBlockSize = targetBlockSize;
        _maxBlockSize = maxBlockSize;
        _logger = client.Telemetry.GetLogger("Revision writer");
    }

    public async ValueTask WriteAsync(
        Stream contentStream,
        long expectedContentLength,
        IEnumerable<Thumbnail> thumbnails,
        DateTimeOffset? lastModificationTime,
        IEnumerable<AdditionalMetadataProperty>? additionalMetadata,
        Action<long>? onProgress,
        CancellationToken cancellationToken)
    {
        var uploadEvent = new UploadEvent
        {
            ExpectedSize = contentStream.Length,
            UploadedSize = 0,
            ApproximateUploadedSize = 0,
            VolumeType = VolumeType.OwnVolume, // FIXME: figure out how to get the actual volume type
        };

        try
        {
            long numberOfBytesUploaded = 0;

            var signingEmailAddress = _membershipAddress.EmailAddress;

            var uploadTasks = new Queue<Task<BlockUploadResult>>(_client.BlockUploader.Queue.Depth);
            var blockIndex = 0;

            var blockUploadResults = new List<BlockUploadResult>(8);
            var expectedThumbnailBlockCount = 0;

            using var sha1 = IncrementalHash.CreateHash(HashAlgorithmName.SHA1);

            var hashingContentStream = new HashingReadStream(contentStream, sha1, leaveOpen: true);

            await using (hashingContentStream.ConfigureAwait(false))
            {
                var blockVerifier = await _client.BlockVerifierFactory.CreateAsync(_revisionUid, _fileKey, cancellationToken).ConfigureAwait(false);

                using var cancellationTokenSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                var linkedCancellationToken = cancellationTokenSource.Token;

                try
                {
                    try
                    {
                        foreach (var thumbnail in thumbnails)
                        {
                            ++expectedThumbnailBlockCount;

                            await WaitForBlockUploaderAsync(uploadTasks, blockUploadResults, linkedCancellationToken).ConfigureAwait(false);

                            var uploadTask = _client.BlockUploader.UploadThumbnailAsync(
                                _revisionUid,
                                _contentKey,
                                _signingKey,
                                _membershipAddress.Id,
                                thumbnail,
                                cancellationTokenSource.Token);

                            uploadTasks.Enqueue(uploadTask);
                        }

                        while (
                            await TryGetBlockPlainDataStreamAsync(
                                hashingContentStream,
                                blockVerifier.DataPacketPrefixMaxLength,
                                linkedCancellationToken).ConfigureAwait(false) is var (plainDataStream, plainDataPrefixBuffer))
                        {
                            try
                            {
                                await WaitForBlockUploaderAsync(uploadTasks, blockUploadResults, linkedCancellationToken).ConfigureAwait(false);

                                plainDataStream.Seek(0, SeekOrigin.Begin);

                                var onBlockProgress = onProgress is not null
                                    ? progress =>
                                    {
                                        numberOfBytesUploaded += progress;

                                        // TODO: move this to a decorator, wrap the progress action
                                        uploadEvent.UploadedSize = numberOfBytesUploaded;
                                        uploadEvent.ApproximateUploadedSize = ReduceSizePrecision(numberOfBytesUploaded);

                                        onProgress(numberOfBytesUploaded);
                                    }
                                : default(Action<long>?);

                                var uploadTask = _client.BlockUploader.UploadContentAsync(
                                    _revisionUid,
                                    ++blockIndex,
                                    _contentKey,
                                    _signingKey,
                                    _membershipAddress.Id,
                                    _fileKey,
                                    plainDataStream,
                                    blockVerifier,
                                    plainDataPrefixBuffer,
                                    (int)Math.Min(blockVerifier.DataPacketPrefixMaxLength, plainDataStream.Length),
                                    onBlockProgress,
                                    _releaseBlocksAction,
                                    linkedCancellationToken);

                                uploadTasks.Enqueue(uploadTask);
                            }
                            catch
                            {
                                ArrayPool<byte>.Shared.Return(plainDataPrefixBuffer);
                                throw;
                            }
                        }
                    }
                    finally
                    {
                        _releaseFileSemaphoreAction.Invoke();
                        _fileReleased = true;
                    }

                    while (uploadTasks.Count > 0)
                    {
                        await RegisterNextCompletedBlockAsync(uploadTasks, blockUploadResults).ConfigureAwait(false);
                    }
                }
                catch
                {
                    await cancellationTokenSource.CancelAsync().ConfigureAwait(false);

                    try
                    {
                        await Task.WhenAll(uploadTasks).ConfigureAwait(false);
                    }
                    catch
                    {
                        // Ignore exceptions because most if not all will just be cancellation-related, and we already have one to re-throw
                    }

                    throw;
                }
            }

            var request = GetRevisionUpdateRequest(
                lastModificationTime,
                blockUploadResults,
                expectedContentLength,
                expectedThumbnailBlockCount,
                sha1.GetCurrentHash(),
                signingEmailAddress,
                additionalMetadata);

            LogSealingRevision(_revisionUid);

            await _client.Api.Files.UpdateRevisionAsync(
                _revisionUid.NodeUid.VolumeId,
                _revisionUid.NodeUid.LinkId,
                _revisionUid.RevisionId,
                request,
                cancellationToken).ConfigureAwait(false);

            LogRevisionSealed(_revisionUid);
        }
        catch (Exception ex)
        {
            uploadEvent.Error = TelemetryErrorResolver.GetUploadErrorFromException(ex);
            uploadEvent.OriginalError = ex.GetBaseException().ToString();
            throw;
        }
        finally
        {
            // TODO: put this in a decorator
            _client.Telemetry.RecordMetric(uploadEvent);
        }
    }

    public void Dispose()
    {
        if (!_fileReleased)
        {
            _releaseFileSemaphoreAction.Invoke();
        }
    }

    private static long ReduceSizePrecision(long size)
    {
        const long precision = 100_000;

        if (size == 0)
        {
            return 0;
        }

        // We care about very small files in metrics, thus we handle explicitely
        // the very small files so they appear correctly in metrics.
        if (size < 4096)
        {
            return 4095;
        }

        if (size < precision)
        {
            return precision;
        }

        return (size / precision) * precision;
    }

    private static async ValueTask RegisterNextCompletedBlockAsync(Queue<Task<BlockUploadResult>> uploadTasks, List<BlockUploadResult> blockUploadResults)
    {
        var blockUploadResult = await uploadTasks.Dequeue().ConfigureAwait(false);

        blockUploadResults.Add(blockUploadResult);
    }

    private async ValueTask<(Stream Stream, byte[] Prefix)?> TryGetBlockPlainDataStreamAsync(
        Stream contentStream,
        int prefixLength,
        CancellationToken cancellationToken)
    {
        var plainDataPrefixBuffer = ArrayPool<byte>.Shared.Rent(prefixLength);
        try
        {
            var plainDataStream = ProtonDriveClient.MemoryStreamManager.GetStream();

            try
            {
                var bytesCopied = await contentStream.PartiallyCopyToAsync(
                    plainDataStream,
                    _targetBlockSize,
                    plainDataPrefixBuffer,
                    cancellationToken).ConfigureAwait(false);

                if (bytesCopied == 0)
                {
                    return null;
                }

                return (plainDataStream, plainDataPrefixBuffer);
            }
            catch
            {
                await plainDataStream.DisposeAsync().ConfigureAwait(false);
                throw;
            }
        }
        catch
        {
            ArrayPool<byte>.Shared.Return(plainDataPrefixBuffer);
            throw;
        }
    }

    private async ValueTask WaitForBlockUploaderAsync(
        Queue<Task<BlockUploadResult>> uploadTasks,
        List<BlockUploadResult> blockUploadResults,
        CancellationToken cancellationToken)
    {
        if (!_client.BlockUploader.Queue.TryStartBlock())
        {
            if (uploadTasks.Count > 0)
            {
                await RegisterNextCompletedBlockAsync(uploadTasks, blockUploadResults).ConfigureAwait(false);
            }

            await _client.BlockUploader.Queue.StartBlockAsync(cancellationToken).ConfigureAwait(false);
        }
    }

    [LoggerMessage(Level = LogLevel.Debug, Message = "Sealing revision \"{RevisionUid}\"")]
    private partial void LogSealingRevision(RevisionUid revisionUid);

    [LoggerMessage(Level = LogLevel.Debug, Message = "Revision \"{RevisionUid}\" sealed")]
    private partial void LogRevisionSealed(RevisionUid revisionUid);

    private RevisionUpdateRequest GetRevisionUpdateRequest(
        DateTimeOffset? lastModificationTime,
        List<BlockUploadResult> blockUploadResults,
        long expectedContentLength,
        int expectedThumbnailBlockCount,
        byte[]? sha1Digest,
        string signingEmailAddress,
        IEnumerable<AdditionalMetadataProperty>? additionalMetadata)
    {
        var manifest = new byte[blockUploadResults.Count * SHA256.HashSizeInBytes];
        using var manifestStream = new MemoryStream(manifest);

        var contentBlockSizes = new List<int>(blockUploadResults.Count);
        var uploadedContentSize = 0L;

        foreach (var (plaintextSize, sha256Digest, isFileContent) in blockUploadResults)
        {
            manifestStream.Write(sha256Digest);

            if (isFileContent)
            {
                contentBlockSizes.Add(plaintextSize);
                uploadedContentSize += plaintextSize;
            }
        }

        if (uploadedContentSize != expectedContentLength)
        {
            throw new IntegrityException("Mismatch between uploaded size and expected size");
        }

        if (expectedThumbnailBlockCount != blockUploadResults.Count - contentBlockSizes.Count)
        {
            throw new IntegrityException("Unexpected number of thumbnail blocks");
        }

        var extendedAttributes = new ExtendedAttributes
        {
            Common = new CommonExtendedAttributes
            {
                Size = uploadedContentSize,
                ModificationTime = lastModificationTime?.UtcDateTime,
                BlockSizes = contentBlockSizes,
                Digests = new FileContentDigestsDto { Sha1 = sha1Digest },
            },
            AdditionalMetadata = additionalMetadata?.ToDictionary(x => x.Name, x => x.Value),
        };

        var extendedAttributesUtf8Bytes = JsonSerializer.SerializeToUtf8Bytes(extendedAttributes, DriveApiSerializerContext.Default.ExtendedAttributes);

        var encryptedExtendedAttributes = _fileKey.EncryptAndSign(extendedAttributesUtf8Bytes, _signingKey, outputCompression: PgpCompression.Default);

        return new RevisionUpdateRequest
        {
            ManifestSignature = _signingKey.Sign(manifest),
            SignatureEmailAddress = signingEmailAddress,
            ExtendedAttributes = encryptedExtendedAttributes,
        };
    }
}
