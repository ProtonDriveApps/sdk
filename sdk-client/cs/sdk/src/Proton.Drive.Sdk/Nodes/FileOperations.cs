using System.Runtime.CompilerServices;
using Proton.Drive.Sdk.Api.Files;

namespace Proton.Drive.Sdk.Nodes;

internal static class FileOperations
{
    private const int MaxThumbnailIdsPerRequest = 30;

    public static async ValueTask<FileSecrets> GetSecretsAsync(ProtonDriveClient client, NodeUid fileUid, bool forPhotos, CancellationToken cancellationToken)
    {
        var fileSecrets = await client.Cache.Secrets.TryGetFileSecretsAsync(fileUid, cancellationToken).ConfigureAwait(false);

        if (fileSecrets is null)
        {
            var metadata = await NodeOperations.GetFreshNodeMetadataAsync(client, fileUid, knownShareAndKey: null, forPhotos, cancellationToken)
                .ConfigureAwait(false);

            fileSecrets = metadata.GetFileSecretsOrThrow();
        }

        return fileSecrets;
    }

    public static async IAsyncEnumerable<FileThumbnail> EnumerateThumbnailsAsync(
        ProtonDriveClient client,
        IEnumerable<NodeUid> fileUids,
        ThumbnailType thumbnailType,
        bool forPhotos,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        // TODO: optimize parallelization for when UIDs are scattered over many volumes
        foreach (var volumeLinkIdGroup in fileUids.GroupBy(uid => uid.VolumeId, uid => uid.LinkId))
        {
            var volumeId = volumeLinkIdGroup.Key;

            var unprocessedLinkIds = volumeLinkIdGroup.ToHashSet();

            var nodeResults = NodeOperations.EnumerateNodesAsync(client, volumeId, unprocessedLinkIds, forPhotos, cancellationToken);

            var errors = new List<FileThumbnail>();

            var thumbnailIds = await nodeResults
                .Select(FileNodeInfo? (node) =>
                {
                    unprocessedLinkIds.Remove(node.Uid.LinkId);

                    if (!node.TryGetFileElseFolder(out var fileNode, out _))
                    {
                        errors.Add(new FileThumbnail(node.Uid, new ProtonDriveError("Node is not a file")));
                        return null;
                    }

                    var revision = fileNode.ActiveRevision;

                    return new FileNodeInfo(fileNode.Uid, revision.Uid, revision.Thumbnails);
                })
                .Where(x => x.HasValue)
                .Select(x => x!.Value)
                .SelectMany(fileNodeInfo =>
                {
                    var thumbnails = fileNodeInfo.Thumbnails;
                    if (thumbnails.All(thumbnail => thumbnail.Type != thumbnailType))
                    {
                        var errorMessage = thumbnails.Count != 0
                            ? $"Node {fileNodeInfo.Uid} has no thumbnail of type {thumbnailType}"
                            : $"Node {fileNodeInfo.Uid} has no thumbnails";

                        errors.Add(new FileThumbnail(fileNodeInfo.Uid, new ProtonDriveError(errorMessage)));
                    }

                    return thumbnails
                        .Where(thumbnail => thumbnail.Type == thumbnailType)
                        .Select(thumbnail => (thumbnail.Id, Info: fileNodeInfo))
                        .ToAsyncEnumerable();
                })
                .ToDictionaryAsync(thumbnail => thumbnail.Id, thumbnail => thumbnail.Info, cancellationToken: cancellationToken)
                .ConfigureAwait(false);

            errors.AddRange(
                unprocessedLinkIds
                    .Select(missingLinkId =>
                        new FileThumbnail(new NodeUid(volumeId, missingLinkId), new ProtonDriveError("Node not found"))));

            foreach (var error in errors)
            {
                yield return error;
            }

            if (thumbnailIds.Count == 0)
            {
                continue;
            }

            // Naive implementation: thumbnails from a batch won't start downloading until all thumbnails from the previous batch have finished downloading,
            // even if there are available download slots in the queue.
            // TODO: allow parallelization across the batch boundaries
            foreach (var thumbnailIdBatch in thumbnailIds.Keys.Chunk(MaxThumbnailIdsPerRequest))
            {
                var response = await client.Api.Files.GetThumbnailBlocksAsync(volumeId, thumbnailIdBatch, cancellationToken).ConfigureAwait(false);

                var tasks = new Queue<Task<FileThumbnail>>();
                var processedThumbnailIds = new HashSet<string>();
                foreach (var block in response.Blocks)
                {
                    processedThumbnailIds.Add(block.ThumbnailId);
                    var nodeInfo = thumbnailIds[block.ThumbnailId];

                    if (!client.ThumbnailDownloadQueue.TryEnqueueBlock())
                    {
                        if (tasks.Count > 0)
                        {
                            yield return await tasks.Dequeue().ConfigureAwait(false);
                        }

                        await client.ThumbnailDownloadQueue.EnqueueBlockAsync(cancellationToken).ConfigureAwait(false);
                    }

                    tasks.Enqueue(DownloadThumbnailAsync(client, nodeInfo.ActiveRevisionUid, block, forPhotos, cancellationToken));
                }

                foreach (var error in response.Errors)
                {
                    if (!thumbnailIds.TryGetValue(error.ThumbnailId, out var nodeInfo))
                    {
                        continue;
                    }

                    processedThumbnailIds.Add(error.ThumbnailId);
                    yield return new FileThumbnail(nodeInfo.Uid, new ProtonDriveError(error.Error));
                }

                // TODO: cancel other thumbnail downloads if one fails
                while (tasks.TryDequeue(out var task))
                {
                    yield return await task.ConfigureAwait(false);
                }

                foreach (var thumbnailId in thumbnailIdBatch.Where(id => !processedThumbnailIds.Contains(id)))
                {
                    yield return new FileThumbnail(thumbnailIds[thumbnailId].Uid, new ProtonDriveError("Thumbnail not found"));
                }
            }
        }
    }

    private static async Task<FileThumbnail> DownloadThumbnailAsync(
        ProtonDriveClient client,
        RevisionUid revisionUid,
        ThumbnailBlock block,
        bool forPhotos,
        CancellationToken cancellationToken)
    {
        const int initialBufferLength = 64 * 1024;

        try
        {
            var outputStream = new MemoryStream(initialBufferLength);
            await using (outputStream.ConfigureAwait(false))
            {
                var fileSecrets = await GetSecretsAsync(client, revisionUid.NodeUid, forPhotos, cancellationToken).ConfigureAwait(false);

                var contentKey = fileSecrets.ContentKey
                    ?? throw new InvalidOperationException($"Content key not available for file {revisionUid.NodeUid}");

                await client.ThumbnailBlockDownloader.DownloadAsync(
                    revisionUid,
                    index: 0,
                    block.BareUrl,
                    block.Token,
                    contentKey,
                    outputStream,
                    cancellationToken).ConfigureAwait(false);
                var thumbnailData = outputStream.TryGetBuffer(out var outputBuffer) ? outputBuffer : outputStream.ToArray();

                return new FileThumbnail(revisionUid.NodeUid, (ReadOnlyMemory<byte>)thumbnailData);
            }
        }
        catch (Exception ex)
        {
            return new FileThumbnail(revisionUid.NodeUid, ex.ToProtonDriveError());
        }
        finally
        {
            client.ThumbnailDownloadQueue.DequeueBlocks(1);
        }
    }

    private readonly record struct FileNodeInfo(NodeUid Uid, RevisionUid ActiveRevisionUid, IReadOnlyList<ThumbnailHeader> Thumbnails);
}
