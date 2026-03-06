using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal static class TraversalOperations
{
    public static async ValueTask<Result<NodeMetadata, DegradedNodeMetadata>> FindRootForNode(
        ProtonDriveClient client,
        Result<NodeMetadata, DegradedNodeMetadata> nodeResult,
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

            nodeResult = await NodeOperations.GetNodeMetadataResultAsync(client, (NodeUid)entryPointUid, knownShareAndKey: null, cancellationToken)
                .ConfigureAwait(false);

            entryPointUid = nodeResult.Merge(x => x.Node.ParentUid, x => x.Node.ParentUid);
        }

        return nodeResult;
    }

    private static NodeUid? GetAlbumEntryPointUid(Result<NodeMetadata, DegradedNodeMetadata> nodeResult)
    {
        return nodeResult.Merge(
            x => x.Node is PhotoNode photo && photo.AlbumUids.Count > 0 ? photo.AlbumUids[0] : (NodeUid?)null,
            x => x.Node is DegradedPhotoNode photo && photo.AlbumUids.Count > 0 ? photo.AlbumUids[0] : null);
    }
}
