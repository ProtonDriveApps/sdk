using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal static class TraversalOperations
{
    public static async ValueTask<Result<NodeMetadata, DegradedNodeMetadata>> FindRootForNode(
        ProtonDriveClient client,
        Result<NodeMetadata, DegradedNodeMetadata> nodeResult,
        CancellationToken cancellationToken)
    {
        var parentUid = nodeResult.Merge(x => x.Node.ParentUid, x => x.Node.ParentUid);
        HashSet<NodeUid> visitedNodes = [];

        while (parentUid is not null)
        {
            if (!visitedNodes.Add((NodeUid)parentUid))
            {
                throw new ProtonDriveException("Folder structure loop detected");
            }

            nodeResult = await NodeOperations.GetNodeMetadataResultAsync(client, (NodeUid)parentUid, knownShareAndKey: null, cancellationToken).ConfigureAwait(false);
            parentUid = nodeResult.Merge(x => x.Node.ParentUid, x => x.Node.ParentUid);
        }

        return nodeResult;
    }
}
