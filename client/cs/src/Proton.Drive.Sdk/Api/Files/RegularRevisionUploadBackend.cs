using System.Diagnostics;
using Microsoft.Extensions.Logging;
using Microsoft.IO;
using Polly;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Account.Addresses;
using Proton.Drive.Sdk.Http;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Nodes.Download;
using Proton.Drive.Sdk.Nodes.Upload;
using Proton.Drive.Sdk.Nodes.Upload.Verification;
using Proton.Drive.Sdk.Resilience;
using Proton.Drive.Sdk.Telemetry;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed partial class RegularRevisionUploadBackend(
    ProtonDriveClient client,
    RevisionUid revisionUid,
    PgpPrivateKey fileKey,
    PgpSessionKey contentKey,
    PgpPrivateKey signingKey,
    Address membershipAddress,
    IBlockVerifier blockVerifier,
    Func<CancellationToken, ValueTask> deleteDraftFunction,
    ILogger logger) : IRevisionUploadBackend
{
    private const int MaxBlockVerificationRetries = 1;

    private bool _isCompleted;

    public RevisionUid? RevisionUid { get; } = revisionUid;

    public bool IsSmallUpload => false;

    public IBlockVerifier BlockVerifier { get; } = blockVerifier;

    public async ValueTask<BlockUploadResult> UploadContentBlockAsync(
        int blockNumber,
        BlockUploadPlainData plainData,
        Action<long>? onProgress,
        CancellationToken cancellationToken)
    {
        var activeRevisionUid = RevisionUid!.Value;

        using (logger.BeginScope("Content block #{BlockNumber} of revision #{RevisionUid}", blockNumber, activeRevisionUid))
        {
            var plainDataLength = plainData.Stream.Length;

            var (encryptionResult, verificationToken) = await ContentEncryptionOperations.EncryptAndVerifyContentBlockAsync(
                ProtonDriveClient.MemoryStreamManager,
                fileKey,
                contentKey,
                signingKey,
                plainData,
                contentKey.IsAead() ? PgpProfile.ProtonAead : PgpProfile.Proton,
                BlockVerifier,
                MaxBlockVerificationRetries,
                retryHelped => RecordBlockVerificationErrorAsync(retryHelped, cancellationToken),
                LogBlockVerificationRetry,
                cancellationToken).ConfigureAwait(false);

            var dataPacketStream = encryptionResult.EncryptedContentStream;
            await using (dataPacketStream.ConfigureAwait(false))
            {
                var result = new BlockUploadResult((int)plainData.Stream.Length, (int)dataPacketStream.Length, encryptionResult.Sha256Digest);

                var request = new BlockUploadPreparationRequest
                {
                    VolumeId = activeRevisionUid.NodeUid.VolumeId,
                    LinkId = activeRevisionUid.NodeUid.LinkId,
                    RevisionId = activeRevisionUid.RevisionId,
                    AddressId = membershipAddress.Id,
                    Blocks =
                    [
                        new BlockCreationRequest
                        {
                            Index = blockNumber,
                            Size = (int)dataPacketStream.Length,
                            HashDigest = result.Sha256Digest,
                            EncryptedSignature = encryptionResult.EncryptedSignature,
                            VerificationOutput = new BlockVerificationOutput { Token = verificationToken.AsReadOnlyMemory() },
                        },
                    ],
                    Thumbnails = [],
                };

                await UploadBlobAsync(request, dataPacketStream, cancellationToken).ConfigureAwait(false);

                onProgress?.Invoke(plainDataLength);

                LogBlobUploaded();

                return result;
            }
        }
    }

    public async ValueTask<BlockUploadResult> UploadThumbnailBlockAsync(Thumbnail thumbnail, CancellationToken cancellationToken)
    {
        var activeRevisionUid = RevisionUid!.Value;

        using (logger.BeginScope("{ThumbnailType} block of revision #{RevisionUid}", thumbnail.Type, activeRevisionUid))
        {
            var pgpProfile = contentKey.IsAead() ? PgpProfile.ProtonAead : PgpProfile.Proton;
            var encryptionResult = await ContentEncryptionOperations.EncryptThumbnailAsync(
                ProtonDriveClient.MemoryStreamManager,
                contentKey,
                signingKey,
                pgpProfile,
                thumbnail.Content,
                cancellationToken).ConfigureAwait(false);

            var dataPacketStream = encryptionResult.EncryptedThumbnailStream;
            await using (dataPacketStream.ConfigureAwait(false))
            {
                var request = new BlockUploadPreparationRequest
                {
                    VolumeId = activeRevisionUid.NodeUid.VolumeId,
                    LinkId = activeRevisionUid.NodeUid.LinkId,
                    RevisionId = activeRevisionUid.RevisionId,
                    AddressId = membershipAddress.Id,
                    Blocks = [],
                    Thumbnails =
                    [
                        new ThumbnailCreationRequest
                        {
                            Size = (int)dataPacketStream.Length,
                            Type = (ThumbnailType)thumbnail.Type,
                            HashDigest = encryptionResult.Sha256Digest,
                        },
                    ],
                };

                await UploadBlobAsync(request, dataPacketStream, cancellationToken).ConfigureAwait(false);

                LogBlobUploaded();

                return new BlockUploadResult(0, (int)dataPacketStream.Length, encryptionResult.Sha256Digest);
            }
        }
    }

    public async ValueTask<UploadResult> CommitAsync(
        RevisionUpdateRequest request,
        ReadOnlyMemory<byte> sha1Digest,
        CancellationToken cancellationToken)
    {
        var activeRevisionUid = RevisionUid!.Value;

        try
        {
            await client.Api.Files.UpdateRevisionAsync(
                activeRevisionUid.NodeUid.VolumeId,
                activeRevisionUid.NodeUid.LinkId,
                activeRevisionUid.RevisionId,
                request,
                cancellationToken).ConfigureAwait(false);
        }
        catch (ProtonApiException ex) when (ex.Code is DriveApiResponseCodes.IncompatibleState)
        {
            if (!await RevisionIsSealedAsync(cancellationToken).ConfigureAwait(false))
            {
                throw;
            }
        }

        _isCompleted = true;

        return new UploadResult(activeRevisionUid.NodeUid, activeRevisionUid);
    }

    public async ValueTask DeleteDraftIfNeededAsync()
    {
        if (_isCompleted)
        {
            return;
        }

        await deleteDraftFunction.Invoke(CancellationToken.None).ConfigureAwait(false);
    }

    private async ValueTask UploadBlobAsync(
        BlockUploadPreparationRequest request,
        RecyclableMemoryStream dataPacketStream,
        CancellationToken cancellationToken)
    {
#pragma warning disable S3236 // FP: https://community.sonarsource.com/t/false-positive-on-s3236-when-calling-debug-assert-with-message/138761/6
        Debug.Assert(request.Thumbnails.Count + request.Blocks.Count == 1, "Block upload request should be for only one block, content or thumbnail");
#pragma warning restore S3236 // Caller information arguments should not be provided explicitly

        var nonDisposableDataPacketStream = new NonDisposingStreamWrapper(dataPacketStream);
        await using (nonDisposableDataPacketStream.ConfigureAwait(false))
        {
            await Policy
                .Handle<Exception>(ex => !cancellationToken.IsCancellationRequested && ExceptionIsRetriable(ex))
                .WaitAndRetryAsync(
                    retryCount: 1,
                    sleepDurationProvider: RetryPolicy.GetAttemptDelay,
                    onRetryAsync: async (exception, _, retryNumber, _) =>
                    {
                        await WaitOnRetryAfterIfNeededAsync(exception, cancellationToken).ConfigureAwait(false);

                        LogBlobUploadRetry(retryNumber, exception.FlattenMessage());
                    })
                .ExecuteAsync(ExecuteUploadAsync).ConfigureAwait(false);
        }

        return;

        static bool ExceptionIsRetriable(Exception ex)
        {
            return ex is not FileContentsDecryptionException;
        }

        async Task ExecuteUploadAsync()
        {
            var uploadRequestResponse = await client.Api.Files.PrepareBlockUploadAsync(request, cancellationToken).ConfigureAwait(false);

            var uploadTarget = request.Thumbnails.Count == 0 ? uploadRequestResponse.UploadTargets[0] : uploadRequestResponse.ThumbnailUploadTargets[0];

            nonDisposableDataPacketStream.Seek(0, SeekOrigin.Begin);

            await client.Api.Storage.UploadBlobAsync(uploadTarget.BareUrl, uploadTarget.Token, nonDisposableDataPacketStream, cancellationToken)
                .ConfigureAwait(false);
        }
    }

    private async Task WaitOnRetryAfterIfNeededAsync(Exception ex, CancellationToken cancellationToken)
    {
        if (ex is TooManyRequestsException exception)
        {
            var currentTime = DateTimeOffset.UtcNow;

            if (exception.RetryAfter is { } retryAfter && retryAfter > currentTime)
            {
                var delayDuration = retryAfter - currentTime;

                LogBlobUploadWaitingForRetryAfter(delayDuration);
                await Task.Delay(delayDuration, cancellationToken).ConfigureAwait(false);
            }
        }
    }

    private async ValueTask<bool> RevisionIsSealedAsync(CancellationToken cancellationToken)
    {
        var activeRevisionUid = RevisionUid!.Value;
        var revisionResponse = await client.Api.Files.GetRevisionAsync(
            activeRevisionUid.NodeUid.VolumeId,
            activeRevisionUid.NodeUid.LinkId,
            activeRevisionUid.RevisionId,
            fromBlockIndex: null,
            pageSize: null,
            false,
            cancellationToken).ConfigureAwait(false);

        return revisionResponse.Revision.State is ApiRevisionState.Active or ApiRevisionState.Obsolete;
    }

    private async Task RecordBlockVerificationErrorAsync(bool retryHelped, CancellationToken cancellationToken)
    {
        try
        {
            var currentRevisionUid = RevisionUid!.Value;
            var volumeType = await TelemetryEventFactory.ResolveVolumeTypeAsync(client, currentRevisionUid.NodeUid, cancellationToken).ConfigureAwait(false);
            client.Telemetry.RecordMetric(new BlockVerificationErrorEvent
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

    [LoggerMessage(Level = LogLevel.Trace, Message = "Uploaded blob")]
    private partial void LogBlobUploaded();

    [LoggerMessage(Level = LogLevel.Warning, Message = "Failed to record metric for block verification error event")]
    private partial void LogBlockVerificationErrorMetricFailed(Exception ex);

    [LoggerMessage(
        Level = LogLevel.Warning,
        Message = "Block verification failed (attempt #{Attempt}), retrying encryption")]
    private partial void LogBlockVerificationRetry(int attempt);

    [LoggerMessage(
        Level = LogLevel.Information,
        Message = "Retrying blob upload (retry number: {RetryNumber}). Previous attempt error: {ErrorMessage}")]
    private partial void LogBlobUploadRetry(int retryNumber, string errorMessage);

    [LoggerMessage(
        Level = LogLevel.Information,
        Message = "Waiting {DelayDuration} before retrying blob upload due to 429 response")]
    private partial void LogBlobUploadWaitingForRetryAfter(TimeSpan delayDuration);
}
