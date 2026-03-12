using System.Buffers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Cryptography;
using Proton.Drive.Sdk.Serialization;
using Proton.Sdk;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Nodes.Upload;

internal sealed partial class RevisionWriter : IDisposable
{
    public const int DefaultBlockSize = 1 << 22; // 4 MiB
    private const int SourceReadingCancellationDelayMilliseconds = 500;

    private readonly ProtonDriveClient _client;
    private readonly RevisionDraft _draft;
    private readonly Action<int> _releaseBlocksAction;
    private readonly Action _releaseFileSemaphoreAction;
    private readonly ILogger _logger;

    private readonly int _targetBlockSize;

    private bool _fileReleased;

    internal RevisionWriter(
        ProtonDriveClient client,
        RevisionDraft draft,
        Action<int> releaseBlocksAction,
        Action releaseFileSemaphoreAction,
        int targetBlockSize = DefaultBlockSize)
    {
        _client = client;
        _draft = draft;
        _releaseBlocksAction = releaseBlocksAction;
        _releaseFileSemaphoreAction = releaseFileSemaphoreAction;
        _targetBlockSize = targetBlockSize;
        _logger = client.Telemetry.GetLogger("Revision writer");
    }

    public async ValueTask WriteAsync(
        Stream contentStream,
        long expectedContentLength,
        Func<ReadOnlyMemory<byte>>? expectedSha1Provider,
        IEnumerable<Thumbnail> thumbnails,
        FileUploadMetadata metadata,
        Action<long>? onProgress,
        CancellationToken cancellationToken)
    {
        try
        {
            var uploadTasks = new Queue<Task<BlockUploadResult>>(_client.BlockUploader.Queue.Depth);

            var signingEmailAddress = _draft.MembershipAddress.EmailAddress;

            int expectedThumbnailBlockCount;

            var hashingContentStream = new HashingReadStream(contentStream, _draft.Sha1, leaveOpen: true);

            await using (hashingContentStream.ConfigureAwait(false))
            {
                try
                {
                    try
                    {
                        expectedThumbnailBlockCount = await UploadThumbnailBlocksAsync(thumbnails, uploadTasks, cancellationToken).ConfigureAwait(false);

                        await UploadContentBlocksAsync(onProgress, hashingContentStream, uploadTasks, cancellationToken).ConfigureAwait(false);
                    }
                    finally
                    {
                        _releaseFileSemaphoreAction.Invoke();
                        _fileReleased = true;
                    }

                    while (uploadTasks.TryDequeue(out var uploadTask))
                    {
                        await uploadTask.ConfigureAwait(false);
                    }
                }
                catch when (uploadTasks.Count > 0)
                {
                    foreach (var uploadTask in uploadTasks)
                    {
                        try
                        {
                            await uploadTask.ConfigureAwait(false);
                        }
                        catch
                        {
                            // Ignore exceptions because most if not all will just be cancellation-related, and we already have one to re-throw
                        }
                    }

                    throw;
                }
            }

            var sha1Digest = _draft.Sha1.GetCurrentHash();

            var hashKey = _draft.HashKey
                ?? await NodeOperations.GetParentFolderHashKeyAsync(_client, _draft.Uid.NodeUid, cancellationToken).ConfigureAwait(false);

            var request = CreateRevisionUpdateRequest(
                metadata,
                expectedContentLength,
                expectedThumbnailBlockCount,
                expectedSha1Provider,
                sha1Digest,
                hashKey,
                signingEmailAddress);

            LogSealingRevision(_draft.Uid);

            try
            {
                await _client.Api.Files.UpdateRevisionAsync(
                    _draft.Uid.NodeUid.VolumeId,
                    _draft.Uid.NodeUid.LinkId,
                    _draft.Uid.RevisionId,
                    request,
                    cancellationToken).ConfigureAwait(false);
            }
            catch (ProtonApiException ex) when (ex.Code is ResponseCode.IncompatibleState)
            {
                // The revision might have been previously sealed without getting the response back due to a cancellation.
                // Throw only if the revision is still not sealed.
                if (!await RevisionIsSealedAsync(cancellationToken).ConfigureAwait(false))
                {
                    throw;
                }
            }

            LogRevisionSealed(_draft.Uid);

            _draft.IsCompleted = true;
        }
        catch (Exception ex) when (!IsResumableError(ex))
        {
            _draft.IsResumable = false;
            throw;
        }
    }

    public void Dispose()
    {
        if (!_fileReleased)
        {
            _releaseFileSemaphoreAction.Invoke();
        }
    }

    private static bool IsResumableError(Exception ex)
    {
        return ex is not ProtonApiException { TransportCode: >= 400 and < 500 }
            and not NodeWithSameNameExistsException
            and not IntegrityException;
    }

    private RevisionUpdateRequest CreateRevisionUpdateRequest(
        FileUploadMetadata metadata,
        long expectedContentLength,
        int expectedThumbnailBlockCount,
        Func<ReadOnlyMemory<byte>>? expectedSha1Provider,
        byte[] sha1Digest,
        ReadOnlyMemory<byte> hashKey,
        string signingEmailAddress)
    {
        var manifest = new byte[(_draft.OrderedThumbnailUploadResults.Count + _draft.OrderedContentBlockStates.Count) * SHA256.HashSizeInBytes];
        using var manifestStream = new MemoryStream(manifest);

        var contentBlockSizes = new List<int>(_draft.OrderedContentBlockStates.Count);
        var uploadedContentSize = 0L;

        var contentBlockUploadResults = _draft.OrderedContentBlockStates
            .Select((blockState, i) =>
            {
                var blockNumber = i + 1;

                return blockState.TryGetSecond(out var uploadResult)
                    ? (Number: blockNumber, Value: uploadResult)
                    : throw new IntegrityException($"Missing content block #{blockNumber}");
            });

        var blockUploadResults = _draft.OrderedThumbnailUploadResults.Select(x => (Number: 0, Value: x)).Concat(contentBlockUploadResults);

        foreach (var (blockNumber, blockUploadResult) in blockUploadResults)
        {
            var (plaintextSize, sha256Digest) = blockUploadResult;

            manifestStream.Write(sha256Digest);

            if (blockNumber == 0)
            {
                // Not a content block
                continue;
            }

            contentBlockSizes.Add(plaintextSize);
            uploadedContentSize += plaintextSize;
        }

        if (uploadedContentSize != expectedContentLength)
        {
            throw new IntegrityException("Mismatch between uploaded size and expected size");
        }

        if (expectedThumbnailBlockCount != _draft.OrderedThumbnailUploadResults.Count)
        {
            throw new IntegrityException("Unexpected number of thumbnail blocks");
        }

        if (expectedSha1Provider is not null)
        {
            var expectedSha1 = expectedSha1Provider();
            if (!expectedSha1.Span.SequenceEqual(sha1Digest))
            {
                throw new IntegrityException("Mismatch between uploaded SHA1 and expected SHA1");
            }
        }

        var extendedAttributes = new ExtendedAttributes
        {
            Common = new CommonExtendedAttributes
            {
                Size = uploadedContentSize,
                ModificationTime = metadata.LastModificationTime?.UtcDateTime,
                BlockSizes = contentBlockSizes,
                Digests = new FileContentDigestsDto { Sha1 = sha1Digest },
            },
            AdditionalMetadata = metadata.AdditionalMetadata?.ToDictionary(x => x.Name, x => x.Value),
        };

        var extendedAttributesUtf8Bytes = JsonSerializer.SerializeToUtf8Bytes(extendedAttributes, DriveApiSerializerContext.Default.ExtendedAttributes);

        var encryptedExtendedAttributes = _draft.FileKey.EncryptAndSign(
            extendedAttributesUtf8Bytes,
            _draft.SigningKey,
            outputCompression: PgpCompression.Default);

        var request = new RevisionUpdateRequest
        {
            ManifestSignature = _draft.SigningKey.Sign(manifest),
            SignatureEmailAddress = signingEmailAddress,
            ExtendedAttributes = encryptedExtendedAttributes,
        };

        if (metadata is PhotosFileUploadMetadata photoMetadata)
        {
            var captureTime = photoMetadata.CaptureTime ?? metadata.LastModificationTime ?? DateTime.UtcNow;

            request.PhotosAttributes = new PhotosAttributesDto
            {
                CaptureTime = captureTime.UtcDateTime,
                ContentHashDigest = HMACSHA256.HashData(hashKey.Span, Encoding.ASCII.GetBytes(Convert.ToHexStringLower(sha1Digest))),
                MainPhotoLinkId = photoMetadata.MainPhotoUid?.LinkId,
                Tags = photoMetadata.Tags?.ToHashSet() ?? [],
            };
        }

        return request;
    }

    private async ValueTask<BlockUploadResult> UploadContentBlockAsync(
        int blockNumber,
        BlockUploadPlainData plainData,
        Action<long>? onBlockProgress,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await _client.BlockUploader.UploadContentAsync(_draft, blockNumber, plainData, onBlockProgress, cancellationToken)
                .ConfigureAwait(false);

            _draft.SetContentBlockUploadResult(blockNumber, result);

            await plainData.DisposeAsync().ConfigureAwait(false);

            return result;
        }
        finally
        {
            try
            {
                _client.BlockUploader.Queue.FinishBlocks(1);
            }
            finally
            {
                _releaseBlocksAction.Invoke(1);
            }
        }
    }

    private async ValueTask<int> UploadThumbnailBlocksAsync(
        IEnumerable<Thumbnail> thumbnails,
        Queue<Task<BlockUploadResult>> uploadTasks,
        CancellationToken cancellationToken)
    {
        var blockCount = 0;

        foreach (var thumbnail in thumbnails)
        {
            ++blockCount;

            if (_draft.ThumbnailBlockWasAlreadyUploaded(thumbnail.Type))
            {
                continue;
            }

            await WaitForBlockUploaderAsync(uploadTasks, cancellationToken).ConfigureAwait(false);

            var uploadTask = UploadThumbnailBlockAsync(thumbnail, cancellationToken).AsTask();

            uploadTasks.Enqueue(uploadTask);
        }

        return blockCount;
    }

    private async ValueTask<BlockUploadResult> UploadThumbnailBlockAsync(Thumbnail thumbnail, CancellationToken cancellationToken)
    {
        try
        {
            var result = await _client.BlockUploader.UploadThumbnailAsync(_draft, thumbnail, cancellationToken).ConfigureAwait(false);

            _draft.SetThumbnailUploadResult(thumbnail.Type, result);

            return result;
        }
        finally
        {
            try
            {
                _client.BlockUploader.Queue.FinishBlocks(1);
            }
            finally
            {
                _client.RevisionCreationSemaphore.Release(1);
            }
        }
    }

    private async ValueTask UploadContentBlocksAsync(
        Action<long>? onProgress,
        HashingReadStream hashingContentStream,
        Queue<Task<BlockUploadResult>> uploadTasks,
        CancellationToken cancellationToken)
    {
        using var delayedCancellationTokenSource = new CancellationTokenSource();

        // We use a delayed cancellation token to give the read operation a fair chance to complete when cancellation is triggered,
        // to not leave the stream in an indeterminate state that would prevent resuming using the same stream later.
        // ReSharper disable once AccessToDisposedClosure
        await using (cancellationToken.Register(() => delayedCancellationTokenSource.CancelAfter(SourceReadingCancellationDelayMilliseconds)))
        {
            int? currentBlockNumber = null;

            while (
                await TryGetNextContentBlockPlainDataAsync(
                    currentBlockNumber,
                    hashingContentStream,
                    _draft.BlockVerifier.DataPacketPrefixMaxLength,
                    delayedCancellationTokenSource.Token).ConfigureAwait(false) is var (newBlockNumber, plainData))
            {
                cancellationToken.ThrowIfCancellationRequested();

                currentBlockNumber = newBlockNumber;

                // ReSharper disable once PossiblyMistakenUseOfCancellationToken
                await WaitForBlockUploaderAsync(uploadTasks, cancellationToken).ConfigureAwait(false);

                var onBlockProgress = onProgress is not null
                    ? progress =>
                    {
                        _draft.NumberOfPlainBytesDone += progress;
                        onProgress(_draft.NumberOfPlainBytesDone);
                    }
                : default(Action<long>?);

                // ReSharper disable once PossiblyMistakenUseOfCancellationToken
                var uploadTask = UploadContentBlockAsync(currentBlockNumber.Value, plainData, onBlockProgress, cancellationToken).AsTask();

                uploadTasks.Enqueue(uploadTask);
            }
        }
    }

    private async ValueTask<(int BlockNumber, BlockUploadPlainData PlainData)?> TryGetNextContentBlockPlainDataAsync(
        int? currentBlockNumber,
        Stream contentStream,
        int prefixLength,
        CancellationToken cancellationToken)
    {
        if (_draft.TryGetNextContentBlockPlainData(currentBlockNumber, out var result))
        {
            result.Value.PlainData.Stream.Seek(0, SeekOrigin.Begin);
            return result;
        }

        currentBlockNumber = _draft.GetNewContentBlockNumber();

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

                plainDataStream.Seek(0, SeekOrigin.Begin);

                var plainData = new BlockUploadPlainData(plainDataStream, plainDataPrefixBuffer);

                _draft.SetContentBlockPlainData(currentBlockNumber.Value, plainData);

                return (currentBlockNumber.Value, plainData);
            }
            catch (Exception)
            {
                _draft.IsResumable = false;

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

    private async ValueTask WaitForBlockUploaderAsync(Queue<Task<BlockUploadResult>> uploadTasks, CancellationToken cancellationToken)
    {
        if (!_client.BlockUploader.Queue.TryStartBlock())
        {
            if (uploadTasks.TryDequeue(out var uploadTask))
            {
                await uploadTask.ConfigureAwait(false);
            }

            await _client.BlockUploader.Queue.StartBlockAsync(cancellationToken).ConfigureAwait(false);
        }
    }

    private async ValueTask<bool> RevisionIsSealedAsync(CancellationToken cancellationToken)
    {
        var revisionResponse = await _client.Api.Files.GetRevisionAsync(
            _draft.Uid.NodeUid.VolumeId,
            _draft.Uid.NodeUid.LinkId,
            _draft.Uid.RevisionId,
            fromBlockIndex: null,
            pageSize: null,
            false,
            cancellationToken).ConfigureAwait(false);

        return revisionResponse.Revision.State is RevisionState.Active or RevisionState.Superseded;
    }

    [LoggerMessage(Level = LogLevel.Debug, Message = "Sealing revision \"{RevisionUid}\"")]
    private partial void LogSealingRevision(RevisionUid revisionUid);

    [LoggerMessage(Level = LogLevel.Debug, Message = "Revision \"{RevisionUid}\" sealed")]
    private partial void LogRevisionSealed(RevisionUid revisionUid);
}
