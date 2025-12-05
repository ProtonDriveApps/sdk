using System.Runtime.CompilerServices;
using Microsoft.Extensions.Logging;
using Proton.Drive.Sdk.Api.Files;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal static partial class FileOperations
{
    public static async ValueTask<Result<FileSecrets, DegradedFileSecrets>> GetSecretsAsync(ProtonDriveClient client, NodeUid fileUid, CancellationToken cancellationToken)
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
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var logger = client.Telemetry.GetLogger("Thumbnail enumeration");

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
                        LogNoThumbnailOnNode(logger, fileNode.Uid);
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

                if (!client.ThumbnailBlockDownloader.Queue.TryStartBlock())
                {
                    if (tasks.Count > 0)
                    {
                        yield return await tasks.Dequeue().ConfigureAwait(false);
                    }

                    await client.ThumbnailBlockDownloader.Queue.StartBlockAsync(cancellationToken).ConfigureAwait(false);
                }

                tasks.Enqueue(DownloadThumbnailAsync(client, fileNode.ActiveRevision.Uid, block, cancellationToken));
            }

            while (tasks.TryDequeue(out var task))
            {
                yield return await task.ConfigureAwait(false);
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

                return new FileThumbnail(revisionUid.NodeUid, thumbnailData);
            }
        }
        finally
        {
            client.ThumbnailBlockDownloader.Queue.FinishBlocks(1);
        }
    }

    [LoggerMessage(Level = LogLevel.Trace, Message = "No thumbnail on node {NodeUid}")]
    private static partial void LogNoThumbnailOnNode(ILogger logger, NodeUid nodeUid);
}
