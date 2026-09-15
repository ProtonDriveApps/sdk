using System.Net;
using System.Security.Cryptography;
using Microsoft.Extensions.Logging;
using Polly;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Cryptography;
using Proton.Drive.Sdk.Resilience;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Nodes.Download;

internal sealed partial class BlockDownloader
{
    private readonly ProtonDriveClient _client;
    private readonly ILogger _logger;

    internal BlockDownloader(ProtonDriveClient client)
    {
        _client = client;
        _logger = client.Telemetry.GetLogger("Block downloader");
    }

    // Returns null when the block is gone; download URLs are short-lived, so a 404 usually just means the token expired.
    internal delegate ValueTask<(string BareUrl, string Token)?> RefreshTransferTarget(CancellationToken cancellationToken);

    public async ValueTask<ReadOnlyMemory<byte>> DownloadAsync(
        RevisionUid revisionUid,
        int index,
        string bareUrl,
        string token,
        PgpSessionKey contentKey,
        Stream outputStream,
        RefreshTransferTarget? refreshTransferTargetAsync,
        CancellationToken cancellationToken)
    {
        var blockBareUrl = bareUrl;
        var blockToken = token;

        return await Policy
            .Handle<Exception>(ex => !cancellationToken.IsCancellationRequested
                && ex is not FileContentsDecryptionException
                && RetryPolicy.IsRetriable(ex))
            .WaitAndRetryAsync(
                retryCount: 4,
                sleepDurationProvider: RetryPolicy.GetAttemptDelay,
                onRetryAsync: async (exception, _, retryNumber, _) =>
                {
                    await WaitOnRetryAfterIfNeededAsync(exception, cancellationToken).ConfigureAwait(false);

                    if (exception is HttpRequestException { StatusCode: HttpStatusCode.NotFound } && refreshTransferTargetAsync is not null)
                    {
                        LogBlobDownloadTokenExpired(index, revisionUid);

                        (blockBareUrl, blockToken) = await refreshTransferTargetAsync(cancellationToken).ConfigureAwait(false)
                            ?? throw new DataIntegrityException("File contents are incomplete", exception);
                    }

                    LogBlobDownloadRetry(index, revisionUid, retryNumber, exception.FlattenMessage());
                    outputStream.Seek(0, SeekOrigin.Begin);
                })
            .ExecuteAsync(ExecuteDownloadAsync).ConfigureAwait(false);

        async Task<byte[]> ExecuteDownloadAsync()
        {
            try
            {
                using var sha256 = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);

                var blobStream = await _client.Api.Storage.GetBlobStreamAsync(blockBareUrl, blockToken, cancellationToken).ConfigureAwait(false);

                var hashingStream = new HashingReadStream(blobStream, sha256);

                await using (hashingStream.ConfigureAwait(false))
                {
                    var decryptingStream = contentKey.OpenDecryptingStream(hashingStream);

                    await using (decryptingStream.ConfigureAwait(false))
                    {
                        await decryptingStream.CopyToAsync(outputStream, cancellationToken).ConfigureAwait(false);
                    }
                }

                return sha256.GetCurrentHash();
            }
            catch (CryptographicException e)
            {
                throw new FileContentsDecryptionException(e);
            }
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

                LogBlobDownloadWaitingForRetryAfter(delayDuration);
                await Task.Delay(delayDuration, cancellationToken).ConfigureAwait(false);
            }
        }
    }

    [LoggerMessage(
            Level = LogLevel.Information,
            Message = "Retrying blob download for block #{BlockIndex} of revision \"{RevisionUid}\" (retry number: {RetryNumber}). Previous attempt error: {ErrorMessage}")]
    private partial void LogBlobDownloadRetry(int blockIndex, RevisionUid revisionUid, int retryNumber, string errorMessage);

    [LoggerMessage(
        Level = LogLevel.Information,
        Message = "Waiting {DelayDuration} before retrying blob download due to 429 response")]
    private partial void LogBlobDownloadWaitingForRetryAfter(TimeSpan delayDuration);

    [LoggerMessage(
        Level = LogLevel.Information,
        Message = "Download token expired for block #{BlockIndex} of revision \"{RevisionUid}\", requesting a new one")]
    private partial void LogBlobDownloadTokenExpired(int blockIndex, RevisionUid revisionUid);
}
