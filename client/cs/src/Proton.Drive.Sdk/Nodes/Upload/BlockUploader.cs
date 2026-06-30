using System.Diagnostics;
using System.Security.Cryptography;
using CommunityToolkit.HighPerformance;
using Microsoft.Extensions.Logging;
using Microsoft.IO;
using Polly;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Cryptography;
using Proton.Drive.Sdk.Http;
using Proton.Drive.Sdk.Nodes.Download;
using Proton.Drive.Sdk.Nodes.Upload.Verification;
using Proton.Drive.Sdk.Resilience;
using Proton.Drive.Sdk.Telemetry;
using Proton.Sdk.Api;
using Proton.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Nodes.Upload;

internal sealed partial class BlockUploader
{
    private const int MaxBlockVerificationRetries = 1;

    private readonly ProtonDriveClient _client;
    private readonly ILogger _logger;

    internal BlockUploader(ProtonDriveClient client)
    {
        _client = client;
        _logger = client.Telemetry.GetLogger("Block uploader");
    }

    public async ValueTask<BlockUploadResult> UploadContentAsync(
        RevisionDraft draft,
        int blockNumber,
        BlockUploadPlainData plainData,
        Action<long>? onBlockProgress,
        CancellationToken cancellationToken)
    {
        using (_logger.BeginScope("Content block #{BlockNumber} of revision #{RevisionUid}", draft.Uid, blockNumber))
        {
            var plainDataLength = plainData.Stream.Length;
            var integrityErrorEncountered = false;
            var attempt = 0;

            while (true)
            {
                attempt++;
                plainData.Stream.Seek(0, SeekOrigin.Begin);

                var signatureOutputStream = ProtonDriveClient.MemoryStreamManager.GetStream();
                await using (signatureOutputStream.ConfigureAwait(false))
                {
                    var pgpProfile = draft.ContentKey.IsAead() ? PgpProfile.ProtonAead : PgpProfile.Proton;

                    var encryptingStream = draft.ContentKey.OpenEncryptingAndSigningReadStream(
                        plainData.Stream,
                        signatureOutputStream,
                        draft.SigningKey,
                        profile: pgpProfile,
                        aeadStreamingChunkLength: PgpDefaults.AeadStreamingChunkLength);

                    await using (encryptingStream)
                    {
                        using var sha256 = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);

                        var hashingStream = new HashingReadStream(encryptingStream, sha256, leaveOpen: true);

                        await using (hashingStream.ConfigureAwait(false))
                        {
                            var dataPacketStream = ProtonDriveClient.MemoryStreamManager.GetStream();
                            await using (dataPacketStream.ConfigureAwait(false))
                            {
                                await hashingStream.CopyToAsync(dataPacketStream, cancellationToken).ConfigureAwait(false);

                                var sha256Digest = sha256.GetCurrentHash();

                                var result = new BlockUploadResult((int)plainData.Stream.Length, sha256Digest);

                                var encryptedSignature = PgpEncrypter.Encrypt(
                                    signatureOutputStream.GetBuffer().AsSpan()[..(int)signatureOutputStream.Length],
                                    draft.FileKey);

                                // FIXME: retry upon verification failure
                                var plainDataPrefixLength = (int)Math.Min(draft.BlockVerifier.DataPacketPrefixMaxLength, plainData.Stream.Length);

                                try
                                {
                                    var verificationToken = draft.BlockVerifier.VerifyBlock(
                                        dataPacketStream.GetFirstBytes(PgpDefaults.AeadDecryptionMinimumInputLength),
                                        plainData.PrefixForVerification.AsSpan()[..plainDataPrefixLength]);

                                    if (integrityErrorEncountered)
                                    {
                                        await RecordBlockVerificationErrorAsync(draft, retryHelped: true, cancellationToken).ConfigureAwait(false);
                                    }

                                    var request = new BlockUploadPreparationRequest
                                    {
                                        VolumeId = draft.Uid.NodeUid.VolumeId,
                                        LinkId = draft.Uid.NodeUid.LinkId,
                                        RevisionId = draft.Uid.RevisionId,
                                        AddressId = draft.MembershipAddress.Id,
                                        Blocks =
                                        [
                                            new BlockCreationRequest
                                            {
                                                Index = blockNumber,
                                                Size = (int)dataPacketStream.Length,
                                                HashDigest = result.Sha256Digest,
                                                EncryptedSignature = new PgpArmoredMessage(encryptedSignature),
                                                VerificationOutput = new BlockVerificationOutput { Token = verificationToken.AsReadOnlyMemory() },
                                            },
                                        ],
                                        Thumbnails = [],
                                    };

                                    await UploadBlobAsync(request, dataPacketStream, cancellationToken).ConfigureAwait(false);

                                    onBlockProgress?.Invoke(plainDataLength);

                                    LogBlobUploaded();

                                    return result;
                                }
                                catch (SessionKeyAndDataPacketMismatchException) when (attempt <= MaxBlockVerificationRetries)
                                {
                                    integrityErrorEncountered = true;
                                    LogBlockVerificationRetry(attempt);
                                }
                                catch (SessionKeyAndDataPacketMismatchException)
                                {
                                    await RecordBlockVerificationErrorAsync(draft, retryHelped: false, cancellationToken).ConfigureAwait(false);
                                    throw;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    public async ValueTask<BlockUploadResult> UploadThumbnailAsync(RevisionDraft draft, Thumbnail thumbnail, CancellationToken cancellationToken)
    {
        using (_logger.BeginScope("{ThumbnailType} block of revision #{RevisionUid}", thumbnail.Type, draft.Uid))
        {
            var pgpProfile = draft.ContentKey.IsAead() ? PgpProfile.ProtonAead : PgpProfile.Proton;

            var encryptingStream = draft.ContentKey.OpenEncryptingAndSigningReadStream(
                thumbnail.Content.AsStream(),
                draft.SigningKey,
                profile: pgpProfile,
                aeadStreamingChunkLength: PgpDefaults.AeadStreamingChunkLength);

            await using (encryptingStream.ConfigureAwait(false))
            {
                using var sha256 = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);

                var hashingStream = new HashingReadStream(encryptingStream, sha256, leaveOpen: true);

                await using (hashingStream.ConfigureAwait(false))
                {
                    var dataPacketStream = ProtonDriveClient.MemoryStreamManager.GetStream();
                    await using (dataPacketStream.ConfigureAwait(false))
                    {
                        await hashingStream.CopyToAsync(dataPacketStream, cancellationToken).ConfigureAwait(false);

                        var sha256Digest = sha256.GetCurrentHash();

                        var request = new BlockUploadPreparationRequest
                        {
                            VolumeId = draft.Uid.NodeUid.VolumeId,
                            LinkId = draft.Uid.NodeUid.LinkId,
                            RevisionId = draft.Uid.RevisionId,
                            AddressId = draft.MembershipAddress.Id,
                            Blocks = [],
                            Thumbnails =
                            [
                                new ThumbnailCreationRequest
                                {
                                    Size = (int)dataPacketStream.Length,
                                    Type = (Api.Files.ThumbnailType)thumbnail.Type,
                                    HashDigest = sha256Digest,
                                },
                            ],
                        };

                        await UploadBlobAsync(request, dataPacketStream, cancellationToken).ConfigureAwait(false);

                        LogBlobUploaded();

                        return new BlockUploadResult(0, sha256Digest);
                    }
                }
            }
        }
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
            // FIXME: request multiple blocks at once
            var uploadRequestResponse = await _client.Api.Files.PrepareBlockUploadAsync(request, cancellationToken).ConfigureAwait(false);

            var uploadTarget = request.Thumbnails.Count == 0 ? uploadRequestResponse.UploadTargets[0] : uploadRequestResponse.ThumbnailUploadTargets[0];

            nonDisposableDataPacketStream.Seek(0, SeekOrigin.Begin);

            await _client.Api.Storage.UploadBlobAsync(uploadTarget.BareUrl, uploadTarget.Token, nonDisposableDataPacketStream, cancellationToken)
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

    private async Task RecordBlockVerificationErrorAsync(RevisionDraft draft, bool retryHelped, CancellationToken cancellationToken)
    {
        try
        {
            var volumeType = await TelemetryEventFactory.ResolveVolumeTypeAsync(_client, draft.Uid.NodeUid, cancellationToken).ConfigureAwait(false);
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
