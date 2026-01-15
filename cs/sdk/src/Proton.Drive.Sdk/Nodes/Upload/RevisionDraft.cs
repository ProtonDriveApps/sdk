using System.Buffers;
using System.Diagnostics.CodeAnalysis;
using System.Security.Cryptography;
using Microsoft.Extensions.Logging;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Nodes.Upload.Verification;
using Proton.Sdk;
using Proton.Sdk.Addresses;

namespace Proton.Drive.Sdk.Nodes.Upload;

internal sealed partial class RevisionDraft(
    RevisionUid uid,
    PgpPrivateKey fileKey,
    PgpSessionKey contentKey,
    PgpPrivateKey signingKey,
    Address membershipAddress,
    IBlockVerifier blockVerifier,
    Func<CancellationToken, ValueTask> deleteDraftFunction,
    ILogger logger) : IAsyncDisposable
{
    private readonly Dictionary<ThumbnailType, BlockUploadResult> _thumbnailUploadResults = [];
    private readonly List<Either<BlockUploadPlainData, BlockUploadResult>> _contentBlockStates = [];

    private readonly Lock _blockUploadStatesLock = new();
    private readonly ILogger _logger = logger;

    public RevisionUid Uid { get; } = uid;
    public PgpPrivateKey FileKey { get; } = fileKey;
    public PgpSessionKey ContentKey { get; } = contentKey;
    public PgpPrivateKey SigningKey { get; } = signingKey;
    public Address MembershipAddress { get; } = membershipAddress;
    public IBlockVerifier BlockVerifier { get; } = blockVerifier;

    public IncrementalHash Sha1 { get; } = IncrementalHash.CreateHash(HashAlgorithmName.SHA1);

    public IReadOnlyDictionary<ThumbnailType, BlockUploadResult> ThumbnailUploadResults => _thumbnailUploadResults;
    public IReadOnlyList<Either<BlockUploadPlainData, BlockUploadResult>> ContentBlockStates => _contentBlockStates;

    public bool IsCompleted { get; set; }
    public long NumberOfPlainBytesDone { get; set; }

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
        return ContentBlockStates.Count + 1;
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

    public async ValueTask DisposeAsync()
    {
        FileKey.Dispose();
        ContentKey.Dispose();
        SigningKey.Dispose();
        Sha1.Dispose();

        var dataItemsToDispose = ContentBlockStates
            .Select(x => x.TryGetFirst(out var data) ? data : (BlockUploadPlainData?)null)
            .Where(task => task is not null)
            .Select(task => task!.Value);

        await Parallel.ForEachAsync(dataItemsToDispose, (data, _) =>
        {
            ArrayPool<byte>.Shared.Return(data.PrefixForVerification);
            return data.Stream.DisposeAsync();
        }).ConfigureAwait(false);

        if (!IsCompleted)
        {
            try
            {
                await deleteDraftFunction.Invoke(CancellationToken.None).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                LogDraftDeletionFailure(ex, Uid);
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Draft deletion failed for revision {RevisionUid}")]
    private partial void LogDraftDeletionFailure(Exception exception, RevisionUid revisionUid);
}
