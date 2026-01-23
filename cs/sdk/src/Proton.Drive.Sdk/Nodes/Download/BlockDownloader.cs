using System.Security.Cryptography;
using Microsoft.Extensions.Logging;
using Polly;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Cryptography;
using Proton.Drive.Sdk.Resilience;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes.Download;

internal sealed partial class BlockDownloader
{
    private readonly ProtonDriveClient _client;
    private readonly ILogger _logger;

    internal BlockDownloader(ProtonDriveClient client, int maxDegreeOfParallelism)
    {
        _client = client;
        _logger = client.Telemetry.GetLogger("Block downloader");

        Queue = new TransferQueue(maxDegreeOfParallelism, client.Telemetry.GetLogger("Block downloader queue"));
    }

    public TransferQueue Queue { get; }

    public async ValueTask<ReadOnlyMemory<byte>> DownloadAsync(
        RevisionUid revisionUid,
        int index,
        string bareUrl,
        string token,
        PgpSessionKey contentKey,
        Stream outputStream,
        CancellationToken cancellationToken)
    {
        return await Policy
            .Handle<Exception>(ex => !cancellationToken.IsCancellationRequested && IsExceptionRetriable(ex))
            .WaitAndRetryAsync(
                retryCount: 4,
                sleepDurationProvider: RetryPolicy.GetAttemptDelay,
                onRetryAsync: async (exception, _, retryNumber, _) =>
                {
                    await WaitOnRetryAfterIfNeededAsync(exception, cancellationToken).ConfigureAwait(false);

                    LogBlobDownloadRetry(index, revisionUid, retryNumber, exception.FlattenMessage());
                    outputStream.Seek(0, SeekOrigin.Begin);
                })
            .ExecuteAsync(ExecuteDownloadAsync).ConfigureAwait(false);

        static bool IsExceptionRetriable(Exception ex)
        {
            return ex is not FileContentsDecryptionException;
        }

        async Task<byte[]> ExecuteDownloadAsync()
        {
            try
            {
                using var sha256 = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);

                var blobStream = await _client.Api.Storage.GetBlobStreamAsync(bareUrl, token, cancellationToken).ConfigureAwait(false);

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
}
