namespace Proton.Drive.Sdk.Nodes;

internal static class TraversalOperations
{
    public static async ValueTask<NodeMetadata> FindRootForNode(
        ProtonDriveClient client,
        NodeMetadata nodeMetadata,
        bool useCacheOnly,
        CancellationToken cancellationToken)
    {
        var currentMetadata = nodeMetadata;
        var entryPointUid = currentMetadata.Node.ParentUid ?? GetAlbumEntryPointUid(currentMetadata);

        HashSet<NodeUid> visitedNodes = [];

        while (entryPointUid is not null)
        {
            if (!visitedNodes.Add((NodeUid)entryPointUid))
            {
                throw new ProtonDriveException("Folder structure loop detected");
            }

            currentMetadata = await NodeOperations.GetNodeMetadataAsync(
                client,
                (NodeUid)entryPointUid,
                knownShareAndKey: null,
                useCacheOnly,
                cancellationToken).ConfigureAwait(false);

            entryPointUid = currentMetadata.Node.ParentUid ?? GetAlbumEntryPointUid(currentMetadata);
        }

        return currentMetadata;
    }

    private static NodeUid? GetAlbumEntryPointUid(NodeMetadata nodeMetadata)
    {
        return nodeMetadata.Node is PhotoNode { AlbumUids.Count: > 0 } photo ? photo.AlbumUids[0] : null;
    }
}
