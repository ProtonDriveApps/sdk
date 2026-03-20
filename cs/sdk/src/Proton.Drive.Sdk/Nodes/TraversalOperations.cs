using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal static class TraversalOperations
{
    public static async ValueTask<Result<NodeMetadata, DegradedNodeMetadata>> FindRootForNode(
        ProtonDriveClient client,
        Result<NodeMetadata, DegradedNodeMetadata> nodeResult,
        bool useCacheOnly,
        CancellationToken cancellationToken)
    {
        var entryPointUid = nodeResult.Merge(x => x.Node.ParentUid, x => x.Node.ParentUid)
            ?? GetAlbumEntryPointUid(nodeResult);

        HashSet<NodeUid> visitedNodes = [];

        while (entryPointUid is not null)
        {
            if (!visitedNodes.Add((NodeUid)entryPointUid))
            {
                throw new ProtonDriveException("Folder structure loop detected");
            }

            nodeResult = await NodeOperations.GetNodeMetadataAsync(client, (NodeUid)entryPointUid, knownShareAndKey: null, useCacheOnly, cancellationToken)
                .ConfigureAwait(false);

            entryPointUid = nodeResult.Merge(x => x.Node.ParentUid, x => x.Node.ParentUid);
        }

        return nodeResult;
    }

    private static NodeUid? GetAlbumEntryPointUid(Result<NodeMetadata, DegradedNodeMetadata> nodeResult)
    {
        return nodeResult.Merge(
            x => x.Node is PhotoNode { AlbumUids.Count: > 0 } photo ? photo.AlbumUids[0] : (NodeUid?)null,
            x => x.Node is DegradedPhotoNode { AlbumUids.Count: > 0 } photo ? photo.AlbumUids[0] : null);
    }
}
