using System.Runtime.CompilerServices;
using Microsoft.Extensions.Logging;
using Proton.Drive.Sdk.Api.Files;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal static partial class FileOperations
{
    public static async ValueTask<FileSecrets> GetSecretsAsync(ProtonDriveClient client, NodeUid fileUid, CancellationToken cancellationToken)
    {
        var fileSecretsResult = await client.Cache.Secrets.TryGetFileSecretsAsync(fileUid, cancellationToken).ConfigureAwait(false);

        var fileSecrets = fileSecretsResult?.GetValueOrDefault();

        if (fileSecrets is null)
        {
            var metadataResult = await NodeOperations.GetFreshNodeMetadataAsync(client, fileUid, knownShareAndKey: null, cancellationToken)
                .ConfigureAwait(false);

            fileSecrets = metadataResult.GetFileSecretsOrThrow();
        }

        return fileSecrets;
    }

    public static async IAsyncEnumerable<FileThumbnail> EnumerateThumbnailsAsync(
        ProtonDriveClient client,
        IEnumerable<NodeUid> fileUids,
        ThumbnailType thumbnailType,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        // TODO: optimize parallelization for when UIDs are scattered over many volumes
        foreach (var volumeLinkIdGroup in fileUids.GroupBy(uid => uid.VolumeId, uid => uid.LinkId))
        {
            var volumeId = volumeLinkIdGroup.Key;

            var nodeResults = NodeOperations.EnumerateNodesAsync(client, volumeId, volumeLinkIdGroup, cancellationToken);

            var thumbnailIds = await nodeResults
                .Select(nodeResult => nodeResult.TryGetValue(out var node) ? node as FileNode : null)
                .Where(fileNode => fileNode is not null)
                .SelectMany(fileNode =>
                {
                    var thumbnails = fileNode!.ActiveRevision.Thumbnails;
                    if (thumbnails.Count == 0)
                    {
                        LogNoThumbnailOnNode(client.Logger, fileNode.Uid);
                    }

                    return thumbnails
                        .Where(thumbnail => thumbnail.Type == thumbnailType)
                        .Select(thumbnail => (thumbnail.Id, Node: fileNode))
                        .ToAsyncEnumerable();
                })
                .ToDictionaryAsync(thumbnail => thumbnail.Id, thumbnail => thumbnail.Node, cancellationToken)
                .ConfigureAwait(false);

            if (thumbnailIds.Count == 0)
            {
                continue;
            }

            var response = await client.Api.Files.GetThumbnailBlocksAsync(volumeId, thumbnailIds.Keys, cancellationToken).ConfigureAwait(false);

            var tasks = new Queue<Task<FileThumbnail>>();
            foreach (var block in response.Blocks)
            {
                var fileNode = thumbnailIds[block.ThumbnailId];

                if (!await client.ThumbnailBlockDownloader.BlockSemaphore.WaitAsync(0, cancellationToken).ConfigureAwait(false))
                {
                    if (tasks.Count > 0)
                    {
                        yield return await tasks.Dequeue().ConfigureAwait(false);
                    }

                    await client.ThumbnailBlockDownloader.BlockSemaphore.WaitAsync(cancellationToken).ConfigureAwait(false);
                }

                tasks.Enqueue(DownloadThumbnailAsync(client, fileNode.Uid, block, cancellationToken));
            }

            while (tasks.TryDequeue(out var task))
            {
                yield return await task.ConfigureAwait(false);
            }
        }
    }

    private static async Task<FileThumbnail> DownloadThumbnailAsync(
        ProtonDriveClient client,
        NodeUid fileUid,
        ThumbnailBlock block,
        CancellationToken cancellationToken)
    {
        const int initialBufferLength = 64 * 1024;

        try
        {
            var outputStream = new MemoryStream(initialBufferLength);
            await using (outputStream.ConfigureAwait(false))
            {
                var fileSecrets = await GetSecretsAsync(client, fileUid, cancellationToken).ConfigureAwait(false);

                await client.ThumbnailBlockDownloader.DownloadAsync(block.BareUrl, block.Token, fileSecrets.ContentKey, outputStream, cancellationToken)
                    .ConfigureAwait(false);

                var thumbnailData = outputStream.TryGetBuffer(out var outputBuffer) ? outputBuffer : outputStream.ToArray();

                return new FileThumbnail(fileUid, thumbnailData);
            }
        }
        finally
        {
            client.ThumbnailBlockDownloader.BlockSemaphore.Release();
        }
    }

    [LoggerMessage(Level = LogLevel.Trace, Message = "No thumbnail on node {NodeUid}")]
    private static partial void LogNoThumbnailOnNode(ILogger logger, NodeUid nodeUid);
}
