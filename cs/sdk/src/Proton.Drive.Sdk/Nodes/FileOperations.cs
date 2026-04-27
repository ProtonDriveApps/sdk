using System.Runtime.CompilerServices;
using Proton.Drive.Sdk.Api.Files;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal static class FileOperations
{
    private const int MaxThumbnailIdsPerRequest = 30;

    public static async ValueTask<Result<FileSecrets, DegradedFileSecrets>> GetSecretsAsync(
        ProtonDriveClient client,
        NodeUid fileUid,
        CancellationToken cancellationToken)
    {
        var fileSecretsResult = await client.Cache.Secrets.TryGetFileSecretsAsync(fileUid, cancellationToken).ConfigureAwait(false);

        if (fileSecretsResult is null)
        {
            var metadataResult = await NodeOperations.GetFreshNodeMetadataAsync(client, fileUid, knownShareAndKey: null, cancellationToken)
                .ConfigureAwait(false);

            fileSecretsResult = metadataResult.GetFileSecretsOrThrow();
        }

        return (Result<FileSecrets, DegradedFileSecrets>)fileSecretsResult;
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
                .Select(FileNodeInfo? (nodeResult) =>
                {
                    nodeResult.TryGetValueElseError(out var node, out var degradedNode);

                    if ((node?.Uid.LinkId ?? degradedNode?.Uid.LinkId) is { } processedLinkId)
                    {
                        unprocessedLinkIds.Remove(processedLinkId);
                    }

                    if (node is FileNode fileNode)
                    {
                        return new FileNodeInfo(fileNode.Uid, fileNode.ActiveRevision.Uid, fileNode.ActiveRevision.Thumbnails);
                    }

                    if (degradedNode is DegradedFileNode { ActiveRevision: { } degradedRevision } degradedFileNode)
                    {
                        if (degradedRevision.CanDecrypt)
                        {
                            return new FileNodeInfo(degradedFileNode.Uid, degradedRevision.Uid, degradedRevision.Thumbnails);
                        }

                        // TODO: yield error results immediately instead of collecting them in a list,
                        // to stream results back to the client as fast as possible (similarly to thumbnail content).
                        errors.Add(
                            degradedRevision.ContentAuthor?.TryGetValueElseError(out _, out var error) == false
                                ? new FileThumbnail(degradedFileNode.Uid, new ProtonDriveError("Cannot decrypt degraded file", error))
                                : new FileThumbnail(degradedFileNode.Uid, new ProtonDriveError("Cannot decrypt degraded file")));

                        return null;
                    }

                    if (node?.Uid is { } nonFileNodeUid)
                    {
                        errors.Add(new FileThumbnail(nonFileNodeUid, new ProtonDriveError("Node is not a file")));
                    }

                    return null;
                })
                .Where(x => x.HasValue)
                .Select(x => x!.Value)
                .SelectMany(fileNodeInfo =>
                {
                    var thumbnails = fileNodeInfo.Thumbnails;
                    if (thumbnails.Count == 0)
                    {
                        errors.Add(new FileThumbnail(fileNodeInfo.Uid, new ProtonDriveError("Node has no thumbnails")));
                    }
                    else if (thumbnails.All(thumbnail => thumbnail.Type != thumbnailType))
                    {
                        errors.Add(new FileThumbnail(fileNodeInfo.Uid, new ProtonDriveError($"Node has no thumbnail of type {thumbnailType}")));
                    }

                    return thumbnails
                        .Where(thumbnail => thumbnail.Type == thumbnailType)
                        .Select(thumbnail => (thumbnail.Id, Info: fileNodeInfo))
                        .ToAsyncEnumerable();
                })
                .ToDictionaryAsync(x => x.Id, x => x.Info, cancellationToken)
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

                    tasks.Enqueue(DownloadThumbnailAsync(client, nodeInfo.ActiveRevisionUid, block, cancellationToken));
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

                foreach (var (thumbnailId, nodeInfo) in thumbnailIds)
                {
                    if (!processedThumbnailIds.Contains(thumbnailId))
                    {
                        yield return new FileThumbnail(nodeInfo.Uid, new ProtonDriveError("Thumbnail not found"));
                    }
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
                var fileSecretsResult = await GetSecretsAsync(client, revisionUid.NodeUid, cancellationToken).ConfigureAwait(false);

                var contentKey = fileSecretsResult.TryGetValueElseError(out var fileSecrets, out var degradedFileSecrets)
                    ? fileSecrets.ContentKey
                    : degradedFileSecrets.ContentKey ?? throw new InvalidOperationException($"Content key not available for file {revisionUid.NodeUid}");

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

    private readonly struct FileNodeInfo(NodeUid uid, RevisionUid activeRevisionUid, IReadOnlyList<ThumbnailHeader> thumbnails)
    {
        public NodeUid Uid { get; } = uid;
        public RevisionUid ActiveRevisionUid { get; } = activeRevisionUid;
        public IReadOnlyList<ThumbnailHeader> Thumbnails { get; } = thumbnails;
    }
}
