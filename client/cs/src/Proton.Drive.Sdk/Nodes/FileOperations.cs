using System.Runtime.CompilerServices;
using Proton.Drive.Sdk.Api.Files;

namespace Proton.Drive.Sdk.Nodes;

internal static class FileOperations
{
    private const int MaxThumbnailIdsPerRequest = 30;

    public static async ValueTask<FileOperationData> GetOperationDataAsync(ProtonDriveClient client, NodeUid uid, CancellationToken cancellationToken)
    {
        var nodeOperationData = await NodeOperations.GetOperationDataAsync(client, uid, cancellationToken).ConfigureAwait(false);

        if (nodeOperationData is not FileOperationData fileOperationData)
        {
            throw new InvalidOperationException($"Node {uid} is not a file.");
        }

        return fileOperationData;
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

            var nodeResults = client.NodeProvider.EnumerateNodeMetadataAsync(volumeId, volumeLinkIdGroup, cancellationToken).ConfigureAwait(false);

            var errors = new List<FileThumbnail>();
            var thumbnailRevisions = new Dictionary<string, Revision>();

            await foreach (var (linkId, result) in nodeResults)
            {
                var nodeUid = new NodeUid(volumeId, linkId);

                if (!result.TryGetValueElseError(out var metadata, out var exception))
                {
                    errors.Add(new FileThumbnail(nodeUid, new ProtonDriveError(exception.Message)));
                    continue;
                }

                var node = metadata.Node;

                if (!node.TryGetFileElseFolder(out var fileNode, out _))
                {
                    errors.Add(new FileThumbnail(nodeUid, new ProtonDriveError("This item is not a file")));
                    continue;
                }

                var revision = fileNode.ActiveRevision;

                if (revision.Thumbnails.All(thumbnail => thumbnail.Type != thumbnailType))
                {
                    var errorMessage = revision.Thumbnails.Count != 0
                        ? "This item has no image preview"
                        : "This item has no image preview available";

                    errors.Add(new FileThumbnail(nodeUid, new ProtonDriveError(errorMessage)));
                    continue;
                }

                foreach (var thumbnail in revision.Thumbnails.Where(thumbnail => thumbnail.Type == thumbnailType))
                {
                    thumbnailRevisions[thumbnail.Id] = revision;
                }
            }

            foreach (var error in errors)
            {
                yield return error;
            }

            if (thumbnailRevisions.Count == 0)
            {
                continue;
            }

            // Naive implementation: thumbnails from a batch won't start downloading until all thumbnails from the previous batch have finished downloading,
            // even if there are available download slots in the queue.
            // TODO: allow parallelization across the batch boundaries
            foreach (var thumbnailIdBatch in thumbnailRevisions.Keys.Chunk(MaxThumbnailIdsPerRequest))
            {
                var response = await client.Api.Files.GetThumbnailBlocksAsync(volumeId, thumbnailIdBatch, cancellationToken).ConfigureAwait(false);

                var tasks = new Queue<Task<FileThumbnail>>();
                var processedThumbnailIds = new HashSet<string>();
                foreach (var block in response.Blocks)
                {
                    processedThumbnailIds.Add(block.ThumbnailId);
                    var revision = thumbnailRevisions[block.ThumbnailId];

                    if (!client.ThumbnailDownloadQueue.TryEnqueueBlock())
                    {
                        if (tasks.Count > 0)
                        {
                            yield return await tasks.Dequeue().ConfigureAwait(false);
                        }

                        await client.ThumbnailDownloadQueue.EnqueueBlockAsync(cancellationToken).ConfigureAwait(false);
                    }

                    tasks.Enqueue(DownloadThumbnailAsync(client, revision.Uid, block, cancellationToken));
                }

                foreach (var error in response.Errors)
                {
                    if (!thumbnailRevisions.TryGetValue(error.ThumbnailId, out var revision))
                    {
                        continue;
                    }

                    processedThumbnailIds.Add(error.ThumbnailId);
                    yield return new FileThumbnail(revision.Uid.NodeUid, new ProtonDriveError(error.Error));
                }

                // TODO: cancel other thumbnail downloads if one fails
                while (tasks.TryDequeue(out var task))
                {
                    yield return await task.ConfigureAwait(false);
                }

                foreach (var thumbnailId in thumbnailIdBatch.Where(id => !processedThumbnailIds.Contains(id)))
                {
                    yield return new FileThumbnail(thumbnailRevisions[thumbnailId].Uid.NodeUid, new ProtonDriveError("Image preview not found"));
                }
            }
        }
    }

    private static async Task<FileThumbnail> DownloadThumbnailAsync(
        ProtonDriveClient client,
        RevisionUid revisionUid,
        ThumbnailBlock block,
        CancellationToken cancellationToken)
    {
        const int initialBufferLength = 64 * 1024;

        try
        {
            var outputStream = new MemoryStream(initialBufferLength);
            await using (outputStream.ConfigureAwait(false))
            {
                var operationData = await GetOperationDataAsync(client, revisionUid.NodeUid, cancellationToken).ConfigureAwait(false);

                var contentKey = operationData.ContentKey
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
}
