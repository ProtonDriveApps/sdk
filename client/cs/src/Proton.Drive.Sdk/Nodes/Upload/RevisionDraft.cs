using System.Buffers;
using System.Diagnostics.CodeAnalysis;
using System.Security.Cryptography;
using Microsoft.Extensions.Logging;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Account.Addresses;
using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Nodes.Upload.Verification;

namespace Proton.Drive.Sdk.Nodes.Upload;

internal sealed partial class RevisionDraft(
    PgpPrivateKey fileKey,
    PgpSessionKey contentKey,
    PgpPrivateKey signingKey,
    ReadOnlyMemory<byte>? parentHashKey,
    Address membershipAddress,
    IRevisionUploadBackend uploadBackend,
    long intendedUploadSize,
    ILogger logger) : IAsyncDisposable
{
    private readonly SortedDictionary<ThumbnailType, BlockUploadResult> _thumbnailUploadResults = [];
    private readonly List<Either<BlockUploadPlainData, BlockUploadResult>> _contentBlockStates = [];

    private readonly Lock _blockUploadStatesLock = new();
    private readonly IRevisionUploadBackend _uploadBackend = uploadBackend;
    private readonly ILogger _logger = logger;

    public RevisionUid? Uid => _uploadBackend.RevisionUid;
    public bool IsSmallUpload => _uploadBackend.IsSmallUpload;
    public PgpPrivateKey FileKey { get; } = fileKey;
    public PgpSessionKey ContentKey { get; } = contentKey;
    public PgpPrivateKey SigningKey { get; } = signingKey;
    public ReadOnlyMemory<byte>? ParentHashKey { get; } = parentHashKey;
    public Address MembershipAddress { get; } = membershipAddress;
    public IBlockVerifier BlockVerifier => _uploadBackend.BlockVerifier;

    public IncrementalHash Sha1 { get; } = IncrementalHash.CreateHash(HashAlgorithmName.SHA1);

    public IReadOnlyCollection<BlockUploadResult> OrderedThumbnailUploadResults => _thumbnailUploadResults.Values;
    public IReadOnlyList<Either<BlockUploadPlainData, BlockUploadResult>> OrderedContentBlockStates => _contentBlockStates;

    public bool IsResumable { get; set; } = true;
    public long NumberOfPlainBytesDone { get; set; }

    public long IntendedUploadSize { get; } = intendedUploadSize;

    public RevisionUid RequireUid()
    {
        return Uid ?? throw new InvalidOperationException("Revision UID is not available before upload commit");
    }

    public void SetContentBlockPlainData(int blockNumber, BlockUploadPlainData plainData)
    {
        lock (_blockUploadStatesLock)
        {
            var blockStateIndex = blockNumber - 1;

            if (blockStateIndex < _contentBlockStates.Count)
            {
                throw new InvalidOperationException("Content block plain data has already been set.");
            }

            _contentBlockStates.Insert(blockStateIndex, plainData);
        }
    }

    public void SetThumbnailUploadResult(ThumbnailType thumbnailType, BlockUploadResult result)
    {
        lock (_blockUploadStatesLock)
        {
            _thumbnailUploadResults[thumbnailType] = result;
        }
    }

    public void SetContentBlockUploadResult(int blockNumber, BlockUploadResult blockUploadResult)
    {
        lock (_blockUploadStatesLock)
        {
            var blockStateIndex = blockNumber - 1;

            if (blockStateIndex >= _contentBlockStates.Count)
            {
                throw new InvalidOperationException("Content block plain data must be set before uploading.");
            }

            _contentBlockStates[blockStateIndex] = blockUploadResult;
        }
    }

    public bool ThumbnailBlockWasAlreadyUploaded(ThumbnailType thumbnailType)
    {
        lock (_blockUploadStatesLock)
        {
            return _thumbnailUploadResults.ContainsKey(thumbnailType);
        }
    }

    public int GetNewContentBlockNumber()
    {
        return OrderedContentBlockStates.Count + 1;
    }

    public bool TryGetNextContentBlockPlainData(
        int? currentBlockNumber,
        [NotNullWhen(true)] out (int BlockNumber, BlockUploadPlainData PlainData)? result)
    {
        lock (_blockUploadStatesLock)
        {
            var offset = currentBlockNumber ?? 0;

            result = _contentBlockStates
                .Skip(offset)
                .Select((x, i) => x.TryGetFirst(out var plainData)
                    ? (offset + i + 1, plainData)
                    : default((int BlockNumber, BlockUploadPlainData PlainData)?))
                .FirstOrDefault(x => x is not null);

            return result is not null;
        }
    }

    public ValueTask<BlockUploadResult> UploadContentBlockAsync(
        int blockNumber,
        BlockUploadPlainData plainData,
        Action<long>? onBlockProgress,
        CancellationToken cancellationToken)
    {
        return _uploadBackend.UploadContentBlockAsync(blockNumber, plainData, onBlockProgress, cancellationToken);
    }

    public ValueTask<BlockUploadResult> UploadThumbnailBlockAsync(Thumbnail thumbnail, CancellationToken cancellationToken)
    {
        return _uploadBackend.UploadThumbnailBlockAsync(thumbnail, cancellationToken);
    }

    public ValueTask<UploadResult> CommitAsync(
        RevisionUpdateRequest request,
        ReadOnlyMemory<byte> sha1Digest,
        CancellationToken cancellationToken)
    {
        return _uploadBackend.CommitAsync(request, sha1Digest, cancellationToken);
    }

    public RevisionUploadStatistics GetUploadStatistics()
    {
        lock (_blockUploadStatesLock)
        {
            return new RevisionUploadStatistics(IsSmallUpload, GetEncryptedContentSizeUnderLock(), _contentBlockStates.Count);
        }
    }

    public async ValueTask DisposeAsync()
    {
        Sha1.Dispose();

        var dataItemsToDispose = OrderedContentBlockStates
            .Select(x => x.TryGetFirst(out var data) ? data : (BlockUploadPlainData?)null)
            .Where(task => task is not null)
            .Select(task => task!.Value);

        await Parallel.ForEachAsync(dataItemsToDispose, (data, _) =>
        {
            ArrayPool<byte>.Shared.Return(data.PrefixForVerification);
            return data.Stream.DisposeAsync();
        }).ConfigureAwait(false);

        try
        {
            await _uploadBackend.DeleteDraftIfNeededAsync().ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            LogDraftDeletionFailure(ex, Uid);
        }
    }

    // Summed on demand rather than accumulated as results arrive: SetThumbnailUploadResult overwrites by
    // thumbnail type, so an accumulator would double count a re-uploaded thumbnail.
    private long GetEncryptedContentSizeUnderLock()
    {
        var total = 0L;

        foreach (var thumbnailUploadResult in _thumbnailUploadResults.Values)
        {
            total += thumbnailUploadResult.EncryptedSize;
        }

        foreach (var contentBlockState in _contentBlockStates)
        {
            if (contentBlockState.TryGetSecond(out var contentBlockUploadResult))
            {
                total += contentBlockUploadResult.EncryptedSize;
            }
        }

        return total;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Draft cleanup failed for revision {RevisionUid}")]
    private partial void LogDraftDeletionFailure(Exception exception, RevisionUid? revisionUid);
}
