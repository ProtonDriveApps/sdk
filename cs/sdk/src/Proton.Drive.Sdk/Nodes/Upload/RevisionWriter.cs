using System.Buffers;
using System.Text.Json;
using Microsoft.IO;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Nodes.Upload.Verification;
using Proton.Drive.Sdk.Serialization;
using Proton.Sdk.Addresses;

namespace Proton.Drive.Sdk.Nodes.Upload;

public sealed class RevisionWriter : IDisposable
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

    private readonly int _targetBlockSize;
    private readonly int _maxBlockSize;

    private bool _semaphoreReleased;

    internal RevisionWriter(
        ProtonDriveClient client,
        RevisionUid revisionUid,
        PgpPrivateKey fileKey,
        PgpSessionKey contentKey,
        PgpPrivateKey signingKey,
        Address membershipAddress,
        Action<int> releaseBlocksAction,
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
        _targetBlockSize = targetBlockSize;
        _maxBlockSize = maxBlockSize;
    }

    public async ValueTask WriteAsync(
        Stream contentInputStream,
        IEnumerable<FileSample> samples,
        DateTimeOffset? lastModificationTime,
        Action<long, long> onProgress,
        CancellationToken cancellationToken)
    {
        long numberOfBytesUploaded = 0;

        var signingEmailAddress = _membershipAddress.EmailAddress;

        var uploadTasks = new Queue<Task<byte[]>>(_client.BlockUploader.MaxDegreeOfParallelism);
        var blockIndex = 0;

        // TODO: provide capacity
        var manifestStream = ProtonDriveClient.MemoryStreamManager.GetStream();

        ArraySegment<byte> manifestSignature;
        var blockSizes = new List<int>(8);

        await using (manifestStream.ConfigureAwait(false))
        {
            var blockVerifier = await BlockVerifier.CreateAsync(_client.Api.Files, _fileUid, _revisionId, _fileKey, cancellationToken).ConfigureAwait(false);

            using var cancellationTokenSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);

            try
            {
                try
                {
                    foreach (var sample in samples)
                    {
                        await WaitForBlockUploaderAsync(uploadTasks, manifestStream, cancellationTokenSource.Token).ConfigureAwait(false);

                        var uploadTask = _client.BlockUploader.UploadThumbnailAsync(
                            _fileUid,
                            _revisionId,
                            _contentKey,
                            _signingKey,
                            _membershipAddress.Id,
                            sample,
                            onProgress: null,
                            cancellationTokenSource.Token);

                        uploadTasks.Enqueue(uploadTask);
                    }

                    if (contentInputStream.Length > 0)
                    {
                        do
                        {
                            var plainDataPrefix = ArrayPool<byte>.Shared.Rent(blockVerifier.DataPacketPrefixMaxLength);
                            try
                            {
                                var plainDataStream = ProtonDriveClient.MemoryStreamManager.GetStream();

                                await contentInputStream.PartiallyCopyToAsync(plainDataStream, _targetBlockSize, plainDataPrefix, cancellationTokenSource.Token)
                                    .ConfigureAwait(false);

                                blockSizes.Add((int)plainDataStream.Length);

                                await WaitForBlockUploaderAsync(uploadTasks, manifestStream, cancellationTokenSource.Token).ConfigureAwait(false);

                                plainDataStream.Seek(0, SeekOrigin.Begin);

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
                                    plainDataPrefix,
                                    (int)Math.Min(blockVerifier.DataPacketPrefixMaxLength, plainDataStream.Length),
                                    progress =>
                                    {
                                        numberOfBytesUploaded += progress;
                                        onProgress(numberOfBytesUploaded, contentInputStream.Length);
                                    },
                                    _releaseBlocksAction,
                                    cancellationTokenSource.Token);

                                uploadTasks.Enqueue(uploadTask);
                            }
                            catch
                            {
                                ArrayPool<byte>.Shared.Return(plainDataPrefix);
                                throw;
                            }
                        } while (contentInputStream.Position < contentInputStream.Length);
                    }
                }
                finally
                {
                    _client.BlockUploader.FileSemaphore.Release();
                    _semaphoreReleased = true;
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

        var request = GetRevisionUpdateRequest(contentInputStream, lastModificationTime, blockSizes, manifestSignature, signingEmailAddress);

        await _client.Api.Files.UpdateRevisionAsync(_fileUid.VolumeId, _fileUid.LinkId, _revisionId, request, cancellationToken).ConfigureAwait(false);
    }

    public void Dispose()
    {
        if (!_semaphoreReleased)
        {
            _client.BlockUploader.FileSemaphore.Release();
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
        Stream contentInputStream,
        DateTimeOffset? lastModificationTime,
        IReadOnlyList<int> blockSizes,
        ArraySegment<byte> manifestSignature,
        string signinEmailAddress)
    {
        var extendedAttributes = new ExtendedAttributes
        {
            Common = new CommonExtendedAttributes
            {
                Size = contentInputStream.Length,
                ModificationTime = lastModificationTime?.UtcDateTime,
                BlockSizes = blockSizes,
            },
        };

        var extendedAttributesUtf8Bytes = JsonSerializer.SerializeToUtf8Bytes(extendedAttributes, DriveApiSerializerContext.Default.ExtendedAttributes);

        var encryptedExtendedAttributes = _fileKey.EncryptAndSign(extendedAttributesUtf8Bytes, _signingKey, outputCompression: PgpCompression.Default);

        return new RevisionUpdateRequest
        {
            ManifestSignature = manifestSignature,
            SignatureEmailAddress = signinEmailAddress,
            ExtendedAttributes = encryptedExtendedAttributes,
        };
    }
}
