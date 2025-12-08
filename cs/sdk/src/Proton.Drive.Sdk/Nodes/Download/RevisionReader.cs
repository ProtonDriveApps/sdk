using System.Runtime.CompilerServices;
using Microsoft.Extensions.Logging;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Telemetry;

namespace Proton.Drive.Sdk.Nodes.Download;

internal sealed partial class RevisionReader : IDisposable
{
    public const int MinBlockIndex = 1;
    public const int DefaultBlockPageSize = 10;

    private readonly ProtonDriveClient _client;
    private readonly PgpPrivateKey _nodeKey;
    private readonly RevisionUid _revisionUid;
    private readonly PgpSessionKey _contentKey;
    private readonly BlockListingRevisionDto _revisionDto;
    private readonly Action<int> _releaseBlockListingAction;
    private readonly Action _releaseFileSemaphoreAction;
    private readonly int _blockPageSize;
    private readonly ILogger _logger;

    private bool _fileSemaphoreReleased;

    private long _totalProgress;

    internal RevisionReader(
        ProtonDriveClient client,
        RevisionUid revisionUid,
        PgpPrivateKey nodeKey,
        PgpSessionKey contentKey,
        BlockListingRevisionDto revisionDto,
        Action<int> releaseBlockListingAction,
        Action releaseFileSemaphoreAction,
        int blockPageSize = DefaultBlockPageSize)
    {
        _client = client;
        _nodeKey = nodeKey;
        _revisionUid = revisionUid;
        _contentKey = contentKey;
        _revisionDto = revisionDto;
        _releaseBlockListingAction = releaseBlockListingAction;
        _releaseFileSemaphoreAction = releaseFileSemaphoreAction;
        _blockPageSize = blockPageSize;
        _logger = client.Telemetry.GetLogger("Revision reader");
    }

    public async ValueTask ReadAsync(Stream contentOutputStream, Action<long, long> onProgress, CancellationToken cancellationToken)
    {
        var downloadEvent = new DownloadEvent
        {
            ClaimedFileSize = -1,
            VolumeType = VolumeType.OwnVolume,
        };

        try
        {
            var downloadTasks = new Queue<Task<BlockDownloadResult>>(_client.BlockDownloader.Queue.Depth);
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
                            if (!_client.BlockDownloader.Queue.TryStartBlock())
                            {
                                if (downloadTasks.Count > 0)
                                {
                                    await WriteNextBlockToOutputAsync(downloadTasks, contentOutputStream, manifestStream, onProgress, cancellationToken)
                                        .ConfigureAwait(false);
                                }

                                await _client.BlockDownloader.Queue.StartBlockAsync(cancellationToken).ConfigureAwait(false);
                            }

                            var downloadTask = DownloadBlockAsync(block, cancellationToken);

                            downloadTasks.Enqueue(downloadTask);
                        }
                    }
                    finally
                    {
                        _releaseFileSemaphoreAction.Invoke();
                        _fileSemaphoreReleased = true;
                    }

                    while (downloadTasks.Count > 0)
                    {
                        await WriteNextBlockToOutputAsync(downloadTasks, contentOutputStream, manifestStream, onProgress, cancellationToken)
                            .ConfigureAwait(false);
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
                        _client.BlockDownloader.Queue.FinishBlocks(downloadTasks.Count);
                    }

                    throw;
                }

                manifestStream.Seek(0, SeekOrigin.Begin);

                var manifestVerificationStatus = await VerifyManifestAsync(manifestStream, cancellationToken).ConfigureAwait(false);

                if (manifestVerificationStatus is not PgpVerificationStatus.Ok)
                {
                    LogFailedManifestVerification(_revisionUid, manifestVerificationStatus);

                    throw new ProtonDriveException("File authenticity check failed");
                }
            }
        }
        catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
        {
            downloadEvent.Error = TelemetryErrorResolver.GetDownloadErrorFromException(ex);
            downloadEvent.OriginalError = ex.GetBaseException().ToString();
            throw;
        }
        finally
        {
            if (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    downloadEvent.ClaimedFileSize = contentOutputStream.Length; // FIXME: try to report actual claimed size from metadata
                    downloadEvent.DownloadedSize = contentOutputStream.Length;
                    _client.Telemetry.RecordMetric(downloadEvent);
                }
                catch
                {
                    // Ignore telemetry errors
                }
            }
        }
    }

    public void Dispose()
    {
        if (!_fileSemaphoreReleased)
        {
            _releaseFileSemaphoreAction.Invoke();
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
                manifestStream.Write(downloadResult.Sha256Digest.Span);

                downloadedStream.Seek(0, SeekOrigin.Begin);

                await downloadedStream.CopyToAsync(outputStream, cancellationToken).ConfigureAwait(false);

                _totalProgress += downloadedStream.Length;

                onProgress(_totalProgress, _revisionDto.Size);
            }
            finally
            {
                await downloadedStream.DisposeAsync().ConfigureAwait(false);
            }
        }
        finally
        {
            _client.BlockDownloader.Queue.FinishBlocks(1);
        }
    }

    private async Task<BlockDownloadResult> DownloadBlockAsync(BlockDto block, CancellationToken cancellationToken)
    {
        var blockOutputStream = ProtonDriveClient.MemoryStreamManager.GetStream();

        var hashDigest = await _client.BlockDownloader.DownloadAsync(
            _revisionUid,
            block.Index,
            block.BareUrl,
            block.Token,
            _contentKey,
            blockOutputStream,
            cancellationToken).ConfigureAwait(false);

        return new BlockDownloadResult(block.Index, blockOutputStream, hashDigest);
    }

    private async IAsyncEnumerable<(BlockDto Value, bool IsLast)> GetBlocksAsync([EnumeratorCancellation] CancellationToken cancellationToken)
    {
        try
        {
            var mustTryNextPageOfBlocks = true;
            var nextExpectedIndex = 1;
            var outstandingBlock = default(BlockDto);
            var currentPageBlocks = new List<BlockDto>(_blockPageSize);

            var revisionDto = _revisionDto;

            while (mustTryNextPageOfBlocks)
            {
                currentPageBlocks.Clear();

                cancellationToken.ThrowIfCancellationRequested();

                if (revisionDto.Blocks.Count == 0)
                {
                    break;
                }

                mustTryNextPageOfBlocks = revisionDto.Blocks.Count >= _blockPageSize;

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
                        LogMissingBlock(block.Index, _revisionUid);

                        throw new ProtonDriveException("File contents are incomplete");
                    }

                    ++nextExpectedIndex;

                    yield return (block, false);
                }

                if (mustTryNextPageOfBlocks)
                {
                    var revisionResponse =
                        await _client.Api.Files.GetRevisionAsync(
                            _revisionUid.NodeUid.VolumeId,
                            _revisionUid.NodeUid.LinkId,
                            _revisionUid.RevisionId,
                            lastKnownIndex + 1,
                            _blockPageSize,
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

        var verificationKeys = string.IsNullOrEmpty(_revisionDto.SignatureEmailAddress)
            ? [_nodeKey.ToPublic()]
            : await _client.Account.GetAddressPublicKeysAsync(_revisionDto.SignatureEmailAddress, cancellationToken).ConfigureAwait(false);

        if (verificationKeys.Count == 0)
        {
            return PgpVerificationStatus.NoVerifier;
        }

        var verificationResult = new PgpKeyRing(verificationKeys).Verify(manifestStream, _revisionDto.ManifestSignature.Value);

        return verificationResult.Status;
    }

    [LoggerMessage(Level = LogLevel.Trace, Message = "Missing block #{BlockIndex} on revision \"{RevisionUid}\"")]
    private partial void LogMissingBlock(int blockIndex, RevisionUid revisionUid);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Manifest verification failed for revision \"{RevisionUid}\": {VerificationStatus}")]
    private partial void LogFailedManifestVerification(RevisionUid revisionUid, PgpVerificationStatus verificationStatus);

    private readonly struct BlockDownloadResult(int index, Stream stream, ReadOnlyMemory<byte> sha256Digest)
    {
        public int Index { get; } = index;
        public Stream Stream { get; } = stream;
        public ReadOnlyMemory<byte> Sha256Digest { get; } = sha256Digest;
    }
}
