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
        var forPhotos = nodeMetadata.Node is PhotoNode;
        var (entryPointUid, nextForPhotos) = GetNextEntryPoint(currentMetadata);
        forPhotos |= nextForPhotos;

        HashSet<NodeUid> visitedNodes = [];

        while (entryPointUid is not null)
        {
            if (!visitedNodes.Add((NodeUid)entryPointUid))
            {
                throw new InvalidOperationException("Folder structure loop detected");
            }

            currentMetadata = await NodeOperations.GetNodeMetadataAsync(
                client,
                (NodeUid)entryPointUid,
                knownShareAndKey: null,
                useCacheOnly,
                forPhotos,
                cancellationToken).ConfigureAwait(false);

            (entryPointUid, nextForPhotos) = GetNextEntryPoint(currentMetadata);
            forPhotos |= nextForPhotos;
        }

        return currentMetadata;
    }

    private static (NodeUid? Uid, bool ForPhotos) GetNextEntryPoint(NodeMetadata nodeMetadata)
    {
        if (nodeMetadata.Node.ParentUid is { } parentUid)
        {
            return (parentUid, nodeMetadata.Node is PhotoNode);
        }

        var albumUid = nodeMetadata.Node is PhotoNode { AlbumUids.Count: > 0 } photo
            ? (NodeUid?)photo.AlbumUids[0]
            : null;

        return (albumUid, albumUid is not null);
    }
}
