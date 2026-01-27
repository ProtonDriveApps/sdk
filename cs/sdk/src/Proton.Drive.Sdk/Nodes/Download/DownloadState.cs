using Microsoft.Extensions.Logging;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Files;

namespace Proton.Drive.Sdk.Nodes.Download;

internal sealed partial class DownloadState(
    RevisionUid uid,
    PgpPrivateKey nodeKey,
    PgpSessionKey contentKey,
    BlockListingRevisionDto revisionDto,
    ILogger logger) : IAsyncDisposable
{
    private readonly List<ReadOnlyMemory<byte>> _downloadedBlockDigests = [];
    private readonly Lock _stateLock = new();
    private readonly ILogger _logger = logger;

    private long _numberOfBytesWritten;
    private bool _isCompleted;

    public RevisionUid Uid { get; } = uid;
    public BlockListingRevisionDto RevisionDto { get; } = revisionDto;
    public PgpPrivateKey NodeKey { get; } = nodeKey;
    public PgpSessionKey ContentKey { get; } = contentKey;

    public int GetNextBlockIndexToDownload()
    {
        lock (_stateLock)
        {
            return _downloadedBlockDigests.Count + 1;
        }
    }

    public IReadOnlyList<ReadOnlyMemory<byte>> GetDownloadedBlockDigests()
    {
        lock (_stateLock)
        {
            return _downloadedBlockDigests;
        }
    }

    public void AddDownloadedBlockDigest(ReadOnlyMemory<byte> sha256Digest)
    {
        lock (_stateLock)
        {
            _downloadedBlockDigests.Add(sha256Digest);
        }
    }

    public long GetNumberOfBytesWritten()
    {
        return Interlocked.Read(ref _numberOfBytesWritten);
    }

    public void AddNumberOfBytesWritten(long bytes)
    {
        Interlocked.Add(ref _numberOfBytesWritten, bytes);
    }

    public void SetIsCompleted()
    {
        _isCompleted = true;
    }

    public ValueTask DisposeAsync()
    {
        NodeKey.Dispose();
        ContentKey.Dispose();

        if (!_isCompleted)
        {
            LogDownloadNotCompleted(Uid);
        }

        return ValueTask.CompletedTask;
    }

    [LoggerMessage(Level = LogLevel.Debug, Message = "Download disposed before completion for revision {RevisionUid}")]
    private partial void LogDownloadNotCompleted(RevisionUid revisionUid);
}
