using System.Buffers;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.IO;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Cryptography;
using Proton.Drive.Sdk.Serialization;
using Proton.Drive.Sdk.Telemetry;
using Proton.Sdk.Addresses;

namespace Proton.Drive.Sdk.Nodes.Upload;

internal sealed class RevisionWriter : IDisposable
{
    public const int DefaultBlockSize = 1 << 22; // 4 MiB

    private readonly ProtonDriveClient _client;
    private readonly NodeUid _fileUid;
    private readonly RevisionId _revisionId;
    private readonly PgpPrivateKey _fileKey;
    private readonly PgpSessionKey _contentKey;
    private readonly PgpPrivateKey _signingKey;
    private readonly Address _membershipAddress;
    private readonly Action<int> _releaseBlocksAction;
    private readonly Action _releaseFileSemaphoreAction;

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
        (_fileUid, _revisionId) = revisionUid;
        _fileKey = fileKey;
        _contentKey = contentKey;
        _signingKey = signingKey;
        _membershipAddress = membershipAddress;
        _releaseBlocksAction = releaseBlocksAction;
        _releaseFileSemaphoreAction = releaseFileSemaphoreAction;
        _targetBlockSize = targetBlockSize;
        _maxBlockSize = maxBlockSize;
    }

    public async ValueTask WriteAsync(
        Stream contentStream,
        IEnumerable<Thumbnail> thumbnails,
        DateTimeOffset? lastModificationTime,
        Action<long, long>? onProgress,
        CancellationToken cancellationToken)
    {
        var uploadEvent = new UploadEvent
        {
            ExpectedSize = contentStream.Length,
            UploadedSize = 0,
            VolumeType = VolumeType.OwnVolume, // FIXME: figure out how to get the actual volume type
        };

        try
        {
            long numberOfBytesUploaded = 0;

            var signingEmailAddress = _membershipAddress.EmailAddress;

            var uploadTasks = new Queue<Task<byte[]>>(_client.BlockUploader.MaxDegreeOfParallelism);
            var blockIndex = 0;

            ArraySegment<byte> manifestSignature;
            var blockSizes = new List<int>(8);

        var contentLength = contentStream.Length - contentStream.Position;

            using var sha1 = IncrementalHash.CreateHash(HashAlgorithmName.SHA1);

            var hashingContentStream = new HashingReadStream(contentStream, sha1, leaveOpen: true);

            await using (hashingContentStream.ConfigureAwait(false))
            {
                // TODO: provide capacity
                var manifestStream = ProtonDriveClient.MemoryStreamManager.GetStream();

                await using (manifestStream.ConfigureAwait(false))
                {
                    var blockVerifier = await _client.BlockVerifierFactory.CreateAsync(_fileUid, _revisionId, _fileKey, cancellationToken)
                        .ConfigureAwait(false);

                    using var cancellationTokenSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                    var linkedCancellationToken = cancellationTokenSource.Token;

                    try
                    {
                        try
                        {
                            foreach (var thumbnail in thumbnails)
                            {
                                await WaitForBlockUploaderAsync(uploadTasks, manifestStream, linkedCancellationToken).ConfigureAwait(false);

                                var uploadTask = _client.BlockUploader.UploadThumbnailAsync(
                                    _fileUid,
                                    _revisionId,
                                    _contentKey,
                                    _signingKey,
                                    _membershipAddress.Id,
                                    thumbnail,
                                    onProgress: null,
                                    cancellationTokenSource.Token);

                                uploadTasks.Enqueue(uploadTask);
                            }

                            if (contentLength > 0)
                            {
                                do
                                {
                                    var plainDataPrefixBuffer = ArrayPool<byte>.Shared.Rent(blockVerifier.DataPacketPrefixMaxLength);
                                    try
                                    {
                                        var plainDataStream = ProtonDriveClient.MemoryStreamManager.GetStream();

                                        var bytesCopied = await hashingContentStream.PartiallyCopyToAsync(
                                            plainDataStream,
                                            _targetBlockSize,
                                            plainDataPrefixBuffer,
                                            linkedCancellationToken).ConfigureAwait(false);

                                        blockSizes.Add((int)plainDataStream.Length);

                                        await WaitForBlockUploaderAsync(uploadTasks, manifestStream, linkedCancellationToken).ConfigureAwait(false);

                                        plainDataStream.Seek(0, SeekOrigin.Begin);

                                        var onBlockProgress = onProgress is not null
                                            ? progress =>
                                            {
                                                numberOfBytesUploaded += progress;

                                                // TODO: move this to a decorator, wrap the progress action
                                                uploadEvent.UploadedSize = numberOfBytesUploaded;

                                                onProgress(numberOfBytesUploaded, contentLength);
                                            }
                                        : default(Action<long>?);

                                        var uploadTask = _client.BlockUploader.UploadContentAsync(
                                            _fileUid,
                                            _revisionId,
                                            ++blockIndex,
                                            _contentKey,
                                            _signingKey,
                                            _membershipAddress.Id,
                                            _fileKey,
                                            plainDataStream,
                                            blockVerifier,
                                            plainDataPrefixBuffer,
                                            Math.Min(blockVerifier.DataPacketPrefixMaxLength, bytesCopied),
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
                                } while (contentStream.Position < contentStream.Length);
                            }
                        }
                        finally
                        {
                            _releaseFileSemaphoreAction.Invoke();
                            _fileReleased = true;
                        }

                        while (uploadTasks.Count > 0)
                        {
                            await AddNextBlockToManifestAsync(uploadTasks, manifestStream).ConfigureAwait(false);
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

                    manifestStream.Seek(0, SeekOrigin.Begin);

                    manifestSignature = await _signingKey.SignAsync(manifestStream, cancellationTokenSource.Token).ConfigureAwait(false);
                }
            }

            var request = GetRevisionUpdateRequest(
                contentLength,
                lastModificationTime,
                blockSizes,
                sha1.GetCurrentHash(),
                manifestSignature,
                signingEmailAddress);

            _client.Logger.LogDebug("Sealing revision {RevisionId} of file {FileUid}", _revisionId, _fileUid);

            await _client.Api.Files.UpdateRevisionAsync(_fileUid.VolumeId, _fileUid.LinkId, _revisionId, request, cancellationToken).ConfigureAwait(false);

            _client.Logger.LogDebug("Revision {RevisionId} of file {FileUid} sealed", _revisionId, _fileUid);
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

    private static async ValueTask AddNextBlockToManifestAsync(Queue<Task<byte[]>> uploadTasks, RecyclableMemoryStream manifestStream)
    {
        var sha256Digest = await uploadTasks.Dequeue().ConfigureAwait(false);

        await manifestStream.WriteAsync(sha256Digest).ConfigureAwait(false);
    }

    private async ValueTask WaitForBlockUploaderAsync(Queue<Task<byte[]>> uploadTasks, RecyclableMemoryStream manifestStream, CancellationToken cancellationToken)
    {
        if (!await _client.BlockUploader.BlockSemaphore.WaitAsync(0, cancellationToken).ConfigureAwait(false))
        {
            if (uploadTasks.Count > 0)
            {
                await AddNextBlockToManifestAsync(uploadTasks, manifestStream).ConfigureAwait(false);
            }

            await _client.BlockUploader.BlockSemaphore.WaitAsync(cancellationToken).ConfigureAwait(false);
        }
    }

    private RevisionUpdateRequest GetRevisionUpdateRequest(
        long contentLength,
        DateTimeOffset? lastModificationTime,
        IReadOnlyList<int> blockSizes,
        byte[]? sha1Digest,
        ArraySegment<byte> manifestSignature,
        string signingEmailAddress)
    {
        var extendedAttributes = new ExtendedAttributes
        {
            Common = new CommonExtendedAttributes
            {
                Size = contentLength,
                ModificationTime = lastModificationTime?.UtcDateTime,
                BlockSizes = blockSizes,
                Digests = new FileContentDigestsDto { Sha1 = sha1Digest },
            },
        };

        var extendedAttributesUtf8Bytes = JsonSerializer.SerializeToUtf8Bytes(extendedAttributes, DriveApiSerializerContext.Default.ExtendedAttributes);

        var encryptedExtendedAttributes = _fileKey.EncryptAndSign(extendedAttributesUtf8Bytes, _signingKey, outputCompression: PgpCompression.Default);

        return new RevisionUpdateRequest
        {
            ManifestSignature = manifestSignature,
            SignatureEmailAddress = signingEmailAddress,
            ExtendedAttributes = encryptedExtendedAttributes,
        };
    }
}
