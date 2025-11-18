using System.Security.Cryptography;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Nodes.Download;

internal sealed class BlockDownloader
{
    private readonly ProtonDriveClient _client;

    internal BlockDownloader(ProtonDriveClient client, int maxDegreeOfParallelism)
    {
        _client = client;
        MaxDegreeOfParallelism = maxDegreeOfParallelism;
        BlockSemaphore = new SemaphoreSlim(maxDegreeOfParallelism, maxDegreeOfParallelism);
    }

    public int MaxDegreeOfParallelism { get; }

    public SemaphoreSlim FileSemaphore { get; } = new(1, 1);
    public SemaphoreSlim BlockSemaphore { get; }

    public async ValueTask<ReadOnlyMemory<byte>> DownloadAsync(
        string bareUrl,
        string token,
        PgpSessionKey contentKey,
        Stream outputStream,
        CancellationToken cancellationToken)
    {
        using var sha256 = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);

        var blobStream = await _client.Api.Storage.GetBlobStreamAsync(bareUrl, token, cancellationToken).ConfigureAwait(false);

        var hashingStream = new HashingReadStream(blobStream, sha256);

        try
        {
            await using (hashingStream.ConfigureAwait(false))
            {
                var decryptingStream = contentKey.OpenDecryptingStream(hashingStream);

                await using (decryptingStream.ConfigureAwait(false))
                {
                    await decryptingStream.CopyToAsync(outputStream, cancellationToken).ConfigureAwait(false);
                }
            }
        }
        catch (CryptographicException e)
        {
            throw new FileContentsDecryptionException(e);
        }

        return sha256.GetCurrentHash();
    }
}
