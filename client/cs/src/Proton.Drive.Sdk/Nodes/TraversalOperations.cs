namespace Proton.Drive.Sdk.Nodes;

internal static class TraversalOperations
{
    public static async ValueTask<NodeMetadata> FindRootForNodeAsync(
        ProtonDriveClient client,
        NodeMetadata nodeMetadata,
        CancellationToken cancellationToken)
    {
        var currentMetadata = nodeMetadata;
        var entryPointUid = GetNextEntryPoint(currentMetadata);

        HashSet<NodeUid> visitedNodes = [];

        while (entryPointUid is not null)
        {
            if (!visitedNodes.Add((NodeUid)entryPointUid))
            {
                throw new InvalidOperationException("Folder structure loop detected");
            }

            currentMetadata = await NodeOperations.GetNodeMetadataAsync(client, (NodeUid)entryPointUid, cancellationToken).ConfigureAwait(false);

            entryPointUid = GetNextEntryPoint(currentMetadata);
        }

        return currentMetadata;
    }

    private static NodeUid? GetNextEntryPoint(NodeMetadata nodeMetadata)
    {
        if (nodeMetadata.Node.ParentUid is { } parentUid)
        {
            return parentUid;
        }

        return nodeMetadata.Node is PhotoNode { AlbumUids.Count: > 0 } photo
            ? photo.AlbumUids[0]
            : null;
    }
}
