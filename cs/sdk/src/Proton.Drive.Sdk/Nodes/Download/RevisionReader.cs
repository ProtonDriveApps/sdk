using System.Runtime.CompilerServices;
using Microsoft.Extensions.Logging;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Files;

namespace Proton.Drive.Sdk.Nodes.Download;

internal sealed class RevisionReader : IDisposable
{
    public const int BlockPageSize = 10;
    public const int MinBlockIndex = 1;

    private readonly ProtonDriveClient _client;
    private readonly NodeUid _fileUid;
    private readonly RevisionId _revisionId;
    private readonly PgpPrivateKey _fileKey;
    private readonly PgpSessionKey _contentKey;
    private readonly BlockListingRevisionDto _revisionDto;
    private readonly Action<int> _releaseBlockListingAction;

    private bool _semaphoreReleased;

    private long _totalProgress;

    internal RevisionReader(
        ProtonDriveClient client,
        RevisionUid revisionUid,
        PgpPrivateKey fileKey,
        PgpSessionKey contentKey,
        BlockListingRevisionDto revisionDto,
        Action<int> releaseBlockListingAction)
    {
        _client = client;
        _fileUid = revisionUid.NodeUid;
        _revisionId = revisionUid.RevisionId;
        _fileKey = fileKey;
        _contentKey = contentKey;
        _revisionDto = revisionDto;
        _releaseBlockListingAction = releaseBlockListingAction;
    }

    public async ValueTask ReadAsync(Stream contentOutputStream, Action<long, long> onProgress, CancellationToken cancellationToken)
    {
        var downloadTasks = new Queue<Task<BlockDownloadResult>>(_client.BlockDownloader.MaxDegreeOfParallelism);
        var manifestStream = ProtonDriveClient.MemoryStreamManager.GetStream();

        await using (manifestStream)
        {
            if (_revisionDto.Thumbnails is { } thumbnails)
            {
                foreach (var sha256Digest in thumbnails.Select(x => x.HashDigest))
                {
                    manifestStream.Write(sha256Digest.Span);
                }
            }

            try
            {
                try
                {
                    await foreach (var (block, _) in GetBlocksAsync(cancellationToken).ConfigureAwait(false))
                    {
                        if (!await _client.BlockDownloader.BlockSemaphore.WaitAsync(0, cancellationToken).ConfigureAwait(false))
                        {
                            if (downloadTasks.Count > 0)
                            {
                                await WriteNextBlockToOutputAsync(downloadTasks, contentOutputStream, manifestStream, onProgress, cancellationToken)
                                    .ConfigureAwait(false);
                            }

                            await _client.BlockDownloader.BlockSemaphore.WaitAsync(cancellationToken).ConfigureAwait(false);
                        }

                        var downloadTask = DownloadBlockAsync(block, contentOutputStream, cancellationToken);

                        downloadTasks.Enqueue(downloadTask);
                    }
                }
                finally
                {
                    _client.BlockDownloader.FileSemaphore.Release();
                    _semaphoreReleased = true;
                }

                while (downloadTasks.Count > 0)
                {
                    await WriteNextBlockToOutputAsync(downloadTasks, contentOutputStream, manifestStream, onProgress, cancellationToken).ConfigureAwait(false);
                }
            }
            catch when (downloadTasks.Count > 0)
            {
                try
                {
                    await Task.WhenAll(downloadTasks).ConfigureAwait(false);
                }
                finally
                {
                    _client.BlockDownloader.BlockSemaphore.Release(downloadTasks.Count);
                }

                throw;
            }

            manifestStream.Seek(0, SeekOrigin.Begin);

            var manifestVerificationStatus = await VerifyManifestAsync(manifestStream, cancellationToken).ConfigureAwait(false);

            if (manifestVerificationStatus is not PgpVerificationStatus.Ok)
            {
                _client.Logger.LogError(
                    "Manifest verification failed for file with UID \"{FileUid}\": {VerificationStatus}",
                    _fileUid,
                    manifestVerificationStatus);

                throw new ProtonDriveException("File authenticity check failed");
            }
        }
    }

    public void Dispose()
    {
        if (!_semaphoreReleased)
        {
            _client.BlockDownloader.FileSemaphore.Release();
        }
    }

    private async Task WriteNextBlockToOutputAsync(
        Queue<Task<BlockDownloadResult>> downloadTasks,
        Stream outputStream,
        Stream manifestStream,
        Action<long, long> onProgress,
        CancellationToken cancellationToken)
    {
        var downloadTask = downloadTasks.Dequeue();

        try
        {
            var downloadResult = await downloadTask.ConfigureAwait(false);

            var downloadedStream = downloadResult.Stream;

            try
            {
                if (downloadResult.VerificationStatus is not PgpVerificationStatus.Ok)
                {
                    _client.Logger.LogWarning(
                        "Verification failed for block #{Index} of file with UID \"{FileUid}\": {VerificationStatus}",
                        downloadResult.Index,
                        _fileUid,
                        downloadResult.VerificationStatus);
                }

                manifestStream.Write(downloadResult.Sha256Digest.Span);

                if (downloadResult.IsIntermediateStream)
                {
                    downloadedStream.Seek(0, SeekOrigin.Begin);

                    await downloadedStream.CopyToAsync(outputStream, cancellationToken).ConfigureAwait(false);
                }

                _totalProgress += downloadedStream.Length;

                onProgress(_totalProgress, _revisionDto.Size);
            }
            finally
            {
                if (downloadResult.IsIntermediateStream)
                {
                    await downloadedStream.DisposeAsync().ConfigureAwait(false);
                }
            }
        }
        finally
        {
            _client.BlockDownloader.BlockSemaphore.Release();
        }
    }

    private async Task<BlockDownloadResult> DownloadBlockAsync(Block block, Stream contentOutputStream, CancellationToken cancellationToken)
    {
        Stream blockOutputStream;
        bool isIntermediateStream;

        if (block.Index == 1)
        {
            blockOutputStream = contentOutputStream;
            isIntermediateStream = false;
        }
        else
        {
            blockOutputStream = ProtonDriveClient.MemoryStreamManager.GetStream();
            isIntermediateStream = true;
        }

        var signatureVerificationKeyRing = !string.IsNullOrEmpty(block.SignatureEmailAddress)
            ? new PgpKeyRing(await _client.Account.GetAddressPublicKeysAsync(block.SignatureEmailAddress, cancellationToken).ConfigureAwait(false))
            : new PgpKeyRing(_fileKey);

        var (hashDigest, verificationStatus) = await _client.BlockDownloader.DownloadAsync(
            block.Url,
            _contentKey,
            block.EncryptedSignature,
            _fileKey,
            signatureVerificationKeyRing,
            blockOutputStream,
            cancellationToken).ConfigureAwait(false);

        return new BlockDownloadResult(block.Index, blockOutputStream, isIntermediateStream, hashDigest, verificationStatus);
    }

    private async IAsyncEnumerable<(Block Value, bool IsLast)> GetBlocksAsync([EnumeratorCancellation] CancellationToken cancellationToken)
    {
        try
        {
            var mustTryNextPageOfBlocks = true;
            var nextExpectedIndex = 1;
            var outstandingBlock = default(Block);
            var currentPageBlocks = new List<Block>(BlockPageSize);

            var revisionDto = _revisionDto;

            while (mustTryNextPageOfBlocks)
            {
                currentPageBlocks.Clear();

                cancellationToken.ThrowIfCancellationRequested();

                if (revisionDto.Blocks.Count == 0)
                {
                    break;
                }

                mustTryNextPageOfBlocks = revisionDto.Blocks.Count >= BlockPageSize;

                currentPageBlocks.AddRange(revisionDto.Blocks);
                currentPageBlocks.Sort((a, b) => a.Index.CompareTo(b.Index));

                var blocksExceptLast = currentPageBlocks.Take(currentPageBlocks.Count - 1);
                var blocksToReturn = outstandingBlock is not null ? blocksExceptLast.Prepend(outstandingBlock) : blocksExceptLast;

                outstandingBlock = currentPageBlocks[^1];
                var lastKnownIndex = outstandingBlock.Index;

                foreach (var block in blocksToReturn)
                {
                    cancellationToken.ThrowIfCancellationRequested();

                    if (block.Index != nextExpectedIndex)
                    {
                        _client.Logger.LogError("Missing block #{BlockIndex} on file with UID \"{FileUid}\"", block.Index, _fileUid);

                        throw new ProtonDriveException("File contents are incomplete");
                    }

                    ++nextExpectedIndex;

                    yield return (block, false);
                }

                if (mustTryNextPageOfBlocks)
                {
                    var revisionResponse =
                        await _client.Api.Files.GetRevisionAsync(
                            _fileUid.VolumeId,
                            _fileUid.LinkId,
                            _revisionId,
                            lastKnownIndex + 1,
                            BlockPageSize,
                            false,
                            cancellationToken).ConfigureAwait(false);

                    revisionDto = revisionResponse.Revision;
                }
            }

            if (outstandingBlock is not null)
            {
                cancellationToken.ThrowIfCancellationRequested();

                yield return (outstandingBlock, true);
            }
        }
        finally
        {
            _releaseBlockListingAction.Invoke(1);
        }
    }

    private async Task<PgpVerificationStatus> VerifyManifestAsync(Stream manifestStream, CancellationToken cancellationToken)
    {
        if (_revisionDto.ManifestSignature is null)
        {
            return PgpVerificationStatus.NotSigned;
        }

        if (string.IsNullOrEmpty(_revisionDto.SignatureEmailAddress))
        {
            return PgpVerificationStatus.NoVerifier;
        }

        var verificationKeys = await _client.Account.GetAddressPublicKeysAsync(_revisionDto.SignatureEmailAddress, cancellationToken).ConfigureAwait(false);

        if (verificationKeys.Count == 0)
        {
            return PgpVerificationStatus.NoVerifier;
        }

        var verificationResult = new PgpKeyRing(verificationKeys).Verify(manifestStream, _revisionDto.ManifestSignature.Value);

        return verificationResult.Status;
    }

    private readonly struct BlockDownloadResult(
        int index,
        Stream stream,
        bool isIntermediateStream,
        ReadOnlyMemory<byte> sha256Digest,
        PgpVerificationStatus verificationStatus)
    {
        public int Index { get; } = index;
        public Stream Stream { get; } = stream;
        public bool IsIntermediateStream { get; } = isIntermediateStream;
        public ReadOnlyMemory<byte> Sha256Digest { get; } = sha256Digest;
        public PgpVerificationStatus VerificationStatus { get; } = verificationStatus;
    }
}
