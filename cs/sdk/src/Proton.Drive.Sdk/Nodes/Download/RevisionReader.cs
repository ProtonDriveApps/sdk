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
    private readonly DownloadState _state;
    private readonly Action<int> _releaseBlockListingAction;
    private readonly Action _releaseFileSemaphoreAction;
    private readonly int _blockPageSize;
    private readonly ILogger _logger;

    private bool _fileSemaphoreReleased;

    internal RevisionReader(
        ProtonDriveClient client,
        DownloadState state,
        Action<int> releaseBlockListingAction,
        Action releaseFileSemaphoreAction,
        int blockPageSize = DefaultBlockPageSize)
    {
        _client = client;
        _state = state;
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
            VolumeType = VolumeType.OwnVolume,  // FIXME: figure out how to get the actual volume type
        };

        try
        {
            var downloadTasks = new Queue<Task<BlockDownloadResult>>(_client.BlockDownloader.Queue.Depth);
            var manifestStream = ProtonDriveClient.MemoryStreamManager.GetStream();

            await using (manifestStream)
            {
                var downloadedBlockDigests = _state.GetDownloadedBlockDigests();
                var revisionDto = _state.RevisionDto;

                // Write thumbnail digests to manifest (if any and on first call)
                if (revisionDto.Thumbnails is { } thumbnails && downloadedBlockDigests.Count == 0)
                {
                    foreach (var sha256Digest in thumbnails.OrderBy(t => t.Type).Select(x => x.HashDigest))
                    {
                        manifestStream.Write(sha256Digest.Span);
                    }
                }

                // Write already-downloaded block digests to manifest (for resumed downloads)
                foreach (var digest in downloadedBlockDigests)
                {
                    manifestStream.Write(digest.Span);
                }

                try
                {
                    try
                    {
                        var startBlockIndex = _state.GetNextBlockIndexToDownload();

                        await foreach (var (block, _) in GetBlocksAsync(startBlockIndex, cancellationToken).ConfigureAwait(false))
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
                    catch
                    {
                        // Ignore exceptions because most if not all will just be cancellation-related, and we already have one to re-throw
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
                    LogFailedManifestVerification(_state.Uid, manifestVerificationStatus);

                    throw new CompletedDownloadManifestVerificationException("File authenticity check failed");
                }

                _state.SetIsCompleted();
            }
        }
        catch (Exception ex) when (!cancellationToken.IsCancellationRequested && TelemetryErrorResolver.GetDownloadErrorFromException(ex) is { } error)
        {
            downloadEvent.Error = error;
            downloadEvent.OriginalError = ex.FlattenMessageWithExceptionType();
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
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to record metric for download event");
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
                _state.AddDownloadedBlockDigest(downloadResult.Sha256Digest);

                manifestStream.Write(downloadResult.Sha256Digest.Span);

                downloadedStream.Seek(0, SeekOrigin.Begin);

                await downloadedStream.CopyToAsync(outputStream, cancellationToken).ConfigureAwait(false);

                _state.AddNumberOfBytesWritten(downloadedStream.Length);

                onProgress(_state.GetNumberOfBytesWritten(), _state.RevisionDto.Size);
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
            _state.Uid,
            block.Index,
            block.BareUrl,
            block.Token,
            _state.ContentKey,
            blockOutputStream,
            cancellationToken).ConfigureAwait(false);

        return new BlockDownloadResult(blockOutputStream, hashDigest);
    }

    private async IAsyncEnumerable<(BlockDto Value, bool IsLast)> GetBlocksAsync(
        int startBlockIndex,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        try
        {
            var mustTryNextPageOfBlocks = true;
            var nextExpectedIndex = startBlockIndex;
            var outstandingBlock = default(BlockDto);
            var currentPageBlocks = new List<BlockDto>(_blockPageSize);

            // Fetch the first page of blocks starting from the desired index
            var revisionResponse = await _client.Api.Files.GetRevisionAsync(
                _state.Uid.NodeUid.VolumeId,
                _state.Uid.NodeUid.LinkId,
                _state.Uid.RevisionId,
                startBlockIndex,
                _blockPageSize,
                withoutBlockUrls: false,
                cancellationToken).ConfigureAwait(false);

            var revisionDto = revisionResponse.Revision;

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
                        LogMissingBlock(block.Index, _state.Uid);

                        throw new ProtonDriveException("File contents are incomplete");
                    }

                    ++nextExpectedIndex;

                    yield return (block, false);
                }

                if (mustTryNextPageOfBlocks)
                {
                    revisionResponse =
                        await _client.Api.Files.GetRevisionAsync(
                            _state.Uid.NodeUid.VolumeId,
                            _state.Uid.NodeUid.LinkId,
                            _state.Uid.RevisionId,
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
        if (_state.RevisionDto.ManifestSignature is null)
        {
            return PgpVerificationStatus.NotSigned;
        }

        var verificationKeys = string.IsNullOrEmpty(_state.RevisionDto.SignatureEmailAddress)
            ? [_state.NodeKey.ToPublic()]
            : await _client.Account.GetAddressPublicKeysAsync(_state.RevisionDto.SignatureEmailAddress, cancellationToken).ConfigureAwait(false);

        if (verificationKeys.Count == 0)
        {
            return PgpVerificationStatus.NoVerifier;
        }

        var verificationResult = new PgpKeyRing(verificationKeys).Verify(manifestStream, _state.RevisionDto.ManifestSignature.Value);

        return verificationResult.Status;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Missing block #{BlockIndex} on revision \"{RevisionUid}\"")]
    private partial void LogMissingBlock(int blockIndex, RevisionUid revisionUid);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Manifest verification failed for revision \"{RevisionUid}\": {VerificationStatus}")]
    private partial void LogFailedManifestVerification(RevisionUid revisionUid, PgpVerificationStatus verificationStatus);

    private readonly record struct BlockDownloadResult(Stream Stream, ReadOnlyMemory<byte> Sha256Digest);
}
