using Microsoft.Extensions.Logging;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Nodes.Upload;
using Proton.Drive.Sdk.Nodes.Upload.Verification;
using Proton.Drive.Sdk.Telemetry;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Api;
using Proton.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed partial class SmallRevisionUploadBackend : IRevisionUploadBackend
{
    private const int MaxBlockVerificationRetries = 1;

    private readonly ProtonDriveClient _client;
    private readonly PgpPrivateKey _fileKey;
    private readonly PgpSessionKey _contentKey;
    private readonly PgpPrivateKey _signingKey;
    private readonly IBlockVerifier _blockVerifier;
    private readonly NewFileSmallUploadParameters? _newFile;
    private readonly RevisionUid? _currentRevisionUid;
    private readonly SortedDictionary<int, EncryptedThumbnail> _thumbnailBlocks = [];
    private readonly Lock _thumbnailBlocksLock = new();
    private readonly ILogger _logger;

    private ContentBlock? _contentBlock;

    private SmallRevisionUploadBackend(
        ProtonDriveClient client,
        PgpPrivateKey fileKey,
        PgpSessionKey contentKey,
        PgpPrivateKey signingKey,
        ReadOnlyMemory<byte> contentKeyPacket,
        NewFileSmallUploadParameters? newFile,
        RevisionUid? currentRevisionUid,
        ILogger logger)
    {
        _client = client;
        _fileKey = fileKey;
        _contentKey = contentKey;
        _signingKey = signingKey;
        _blockVerifier = new SmallFileUploadBlockVerifier(fileKey, contentKeyPacket);
        _newFile = newFile;
        _currentRevisionUid = currentRevisionUid;
        _logger = logger;
    }

    public RevisionUid? RevisionUid => _currentRevisionUid;

    public bool IsSmallUpload => true;

    public IBlockVerifier BlockVerifier => _blockVerifier;

    public static SmallRevisionUploadBackend ForNewFile(
        ProtonDriveClient client,
        PgpPrivateKey fileKey,
        PgpSessionKey contentKey,
        PgpPrivateKey signingKey,
        VolumeId parentVolumeId,
        FileCreationRequest fileCreationRequest,
        FileOperationData fileSecrets,
        ILogger logger)
    {
        return new SmallRevisionUploadBackend(
            client,
            fileKey,
            contentKey,
            signingKey,
            fileCreationRequest.ContentKeyPacket,
            new NewFileSmallUploadParameters(parentVolumeId, fileCreationRequest, fileSecrets),
            currentRevisionUid: null,
            logger);
    }

    public static SmallRevisionUploadBackend ForRevision(
        ProtonDriveClient client,
        RevisionUid currentRevisionUid,
        PgpPrivateKey fileKey,
        PgpSessionKey contentKey,
        PgpPrivateKey signingKey,
        ReadOnlyMemory<byte> contentKeyPacket,
        ILogger logger)
    {
        return new SmallRevisionUploadBackend(
            client,
            fileKey,
            contentKey,
            signingKey,
            contentKeyPacket,
            newFile: null,
            currentRevisionUid,
            logger);
    }

    public async ValueTask<BlockUploadResult> UploadContentBlockAsync(
        int blockNumber,
        BlockUploadPlainData plainData,
        Action<long>? onProgress,
        CancellationToken cancellationToken)
    {
        if (blockNumber != 1 || _contentBlock is not null)
        {
            throw new SmallUploadNotApplicableException("Small upload supports exactly one content block");
        }

        var (encryptionResult, verificationToken) = await ContentEncryptionOperations.EncryptAndVerifyContentBlockAsync(
            ProtonDriveClient.MemoryStreamManager,
            _fileKey,
            _contentKey,
            _signingKey,
            plainData,
            _contentKey.IsAead() ? PgpProfile.ProtonAead : PgpProfile.Proton,
            _blockVerifier,
            MaxBlockVerificationRetries,
            retryHelped => RecordBlockVerificationErrorAsync(retryHelped, cancellationToken),
            onRetry: null,
            cancellationToken).ConfigureAwait(false);

        var encryptedStream = encryptionResult.EncryptedContentStream;
        await using (encryptedStream.ConfigureAwait(false))
        {
            var encryptedBytes = encryptedStream.ToArray();

            _contentBlock = new ContentBlock(
                encryptedBytes,
                encryptionResult.EncryptedSignature,
                verificationToken.AsReadOnlyMemory());

            onProgress?.Invoke(plainData.Stream.Length);

            return new BlockUploadResult((int)plainData.Stream.Length, encryptedBytes.Length, encryptionResult.Sha256Digest);
        }
    }

    public async ValueTask<BlockUploadResult> UploadThumbnailBlockAsync(Thumbnail thumbnail, CancellationToken cancellationToken)
    {
        var encryptionResult = await ContentEncryptionOperations.EncryptThumbnailAsync(
            ProtonDriveClient.MemoryStreamManager,
            _contentKey,
            _signingKey,
            _contentKey.IsAead() ? PgpProfile.ProtonAead : PgpProfile.Proton,
            thumbnail.Content,
            cancellationToken).ConfigureAwait(false);

        var encryptedStream = encryptionResult.EncryptedThumbnailStream;
        await using (encryptedStream.ConfigureAwait(false))
        {
            var encryptedBytes = encryptedStream.ToArray();
            var encryptedThumbnail = new EncryptedThumbnail((int)thumbnail.Type, encryptedBytes);

            // Thumbnails upload concurrently; key by type (types are unique) under a lock so the accumulated set cannot be
            // corrupted by a racing add and stays deterministically ordered to match the manifest.
            lock (_thumbnailBlocksLock)
            {
                _thumbnailBlocks[(int)thumbnail.Type] = encryptedThumbnail;
            }

            return new BlockUploadResult(0, encryptedBytes.Length, encryptionResult.Sha256Digest);
        }
    }

    public async ValueTask<UploadResult> CommitAsync(
        RevisionUpdateRequest request,
        ReadOnlyMemory<byte> sha1Digest,
        CancellationToken cancellationToken)
    {
        List<EncryptedThumbnail> thumbnailBlocks;
        lock (_thumbnailBlocksLock)
        {
            thumbnailBlocks = [.. _thumbnailBlocks.Values];
        }

        if (_newFile is { } newFile)
        {
            var metadata = new SmallFileUploadMetadataRequest
            {
                Name = newFile.FileCreationRequest.Name,
                NameHash = newFile.FileCreationRequest.NameHashDigest,
                ParentLinkId = newFile.FileCreationRequest.ParentLinkId,
                NodePassphrase = newFile.FileCreationRequest.Passphrase,
                NodePassphraseSignature = newFile.FileCreationRequest.PassphraseSignature,
                NodeKey = newFile.FileCreationRequest.Key,
                MediaType = newFile.FileCreationRequest.MediaType,
                ContentKeyPacket = newFile.FileCreationRequest.ContentKeyPacket,
                ContentKeySignature = newFile.FileCreationRequest.ContentKeySignature,
                ManifestSignature = request.ManifestSignature,
                ChecksumVerified = request.ChecksumVerified,
                SignatureEmailAddress = request.SignatureEmailAddress,
                ContentBlockVerificationToken = _contentBlock?.VerificationToken,
                ExtendedAttributes = request.ExtendedAttributes,
                ContentBlockEncSignature = _contentBlock?.EncryptedSignature,
                Photo = null,
            };

            SmallUploadResponse response;
            try
            {
                response = await _client.Api.Files.UploadSmallFileAsync(
                    newFile.ParentVolumeId,
                    metadata,
                    _contentBlock?.EncryptedBytes,
                    thumbnailBlocks,
                    cancellationToken).ConfigureAwait(false);
            }
            catch (ProtonApiException<RevisionErrorResponse> e) when (e.Code is DriveApiResponseCodes.AlreadyExists)
            {
                throw new NodeWithSameNameExistsException(newFile.ParentVolumeId, e);
            }

            var nodeUid = new NodeUid(newFile.ParentVolumeId, response.LinkId);
            var revisionUid = new RevisionUid(nodeUid, response.RevisionId);

            await _client.Cache.SetNodeOperationDataAsync(nodeUid, newFile.FileSecrets, cancellationToken).ConfigureAwait(false);

            return new UploadResult(nodeUid, revisionUid);
        }

        var currentRevisionUid = _currentRevisionUid ?? throw new InvalidOperationException("Missing current revision UID");
        var revisionMetadata = new SmallRevisionUploadMetadataRequest
        {
            CurrentRevisionId = currentRevisionUid.RevisionId,
            ManifestSignature = request.ManifestSignature,
            ChecksumVerified = request.ChecksumVerified,
            SignatureEmailAddress = request.SignatureEmailAddress,
            ContentBlockEncSignature = _contentBlock?.EncryptedSignature,
            ContentBlockVerificationToken = _contentBlock?.VerificationToken,
            ExtendedAttributes = request.ExtendedAttributes,
        };

        SmallUploadResponse revisionResponse;
        try
        {
            revisionResponse = await _client.Api.Files.UploadSmallRevisionAsync(
                currentRevisionUid.NodeUid.VolumeId,
                currentRevisionUid.NodeUid.LinkId,
                revisionMetadata,
                _contentBlock?.EncryptedBytes,
                thumbnailBlocks,
                cancellationToken).ConfigureAwait(false);
        }
        catch (ProtonApiException<RevisionErrorResponse> e) when (e.Code is DriveApiResponseCodes.AlreadyExists)
        {
            throw new RevisionDraftConflictException(e);
        }

        var uploadedRevisionUid = new RevisionUid(currentRevisionUid.NodeUid, revisionResponse.RevisionId);
        return new UploadResult(currentRevisionUid.NodeUid, uploadedRevisionUid);
    }

    public ValueTask DeleteDraftIfNeededAsync()
    {
        return ValueTask.CompletedTask;
    }

    private async Task RecordBlockVerificationErrorAsync(bool retryHelped, CancellationToken cancellationToken)
    {
        try
        {
            // Volume type is per-volume, so the parent's volume id is sufficient when the new file has no node UID yet.
            var nodeUid = _currentRevisionUid?.NodeUid
                ?? new NodeUid(_newFile!.ParentVolumeId, _newFile.FileCreationRequest.ParentLinkId);

            var volumeType = await TelemetryEventFactory.ResolveVolumeTypeAsync(_client, nodeUid, cancellationToken).ConfigureAwait(false);

            _client.Telemetry.RecordMetric(new BlockVerificationErrorEvent
            {
                VolumeType = volumeType,
                RetryHelped = retryHelped,
            });
        }
        catch (Exception ex)
        {
            LogBlockVerificationErrorMetricFailed(ex);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Failed to record metric for block verification error event")]
    private partial void LogBlockVerificationErrorMetricFailed(Exception ex);

    private readonly record struct ContentBlock(
        byte[] EncryptedBytes,
        PgpArmoredMessage EncryptedSignature,
        ReadOnlyMemory<byte> VerificationToken);

    private sealed record NewFileSmallUploadParameters(VolumeId ParentVolumeId, FileCreationRequest FileCreationRequest, FileOperationData FileSecrets);
}
