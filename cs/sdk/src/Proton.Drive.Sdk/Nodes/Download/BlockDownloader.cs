using System.Security.Cryptography;
using Proton.Cryptography.Pgp;

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

    public async ValueTask<ReadOnlyMemory<byte>> DownloadAsync(string url, PgpSessionKey contentKey, Stream outputStream, CancellationToken cancellationToken)
    {
        using var sha256 = SHA256.Create();

        var blobStream = await _client.Api.Storage.GetBlobStreamAsync(url, cancellationToken).ConfigureAwait(false);

        var hashingStream = new CryptoStream(blobStream, sha256, CryptoStreamMode.Read);

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

        sha256.TransformFinalBlock([], 0, 0);

        return sha256.Hash;
    }
}
