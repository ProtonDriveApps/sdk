using System.Security.Cryptography;
using Microsoft.Extensions.Logging;
using Polly;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Cryptography;
using Proton.Drive.Sdk.Resilience;

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
            .Handle<Exception>(ex => ex is not FileContentsDecryptionException)
            .WaitAndRetryAsync(
                retryCount: 4,
                sleepDurationProvider: RetryPolicy.GetAttemptDelay,
                onRetry: (exception, _, retryNumber, _) =>
                {
                    LogBlobDownloadFailure(exception, index, revisionUid, retryNumber);
                    outputStream.Seek(0, SeekOrigin.Begin);
                })
            .ExecuteAsync(ExecuteDownloadAsync).ConfigureAwait(false);

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

    [LoggerMessage(
            Level = LogLevel.Information,
            Message = "Blob download failed for block #{BlockIndex} for revision \"{RevisionUid}\" (retry number: {RetryNumber})")]
    private partial void LogBlobDownloadFailure(Exception exception, int blockIndex, RevisionUid revisionUid, int retryNumber);
}
