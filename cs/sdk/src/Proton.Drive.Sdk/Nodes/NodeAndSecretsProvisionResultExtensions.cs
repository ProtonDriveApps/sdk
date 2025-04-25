using System.Diagnostics.CodeAnalysis;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Links;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal static class NodeAndSecretsProvisionResultExtensions
{
    public static Node GetNodeOrThrow(this Result<NodeAndSecrets, DegradedNodeAndSecrets> provisionResult)
    {
        var nodeAndSecrets = provisionResult.GetValueOrThrow();

        return nodeAndSecrets.TryGetFileElseFolder(out var fileNode, out _, out var folderNode, out _)
            ? fileNode
            : folderNode;
    }

    public static FolderNode GetFolderNodeOrThrow(this Result<NodeAndSecrets, DegradedNodeAndSecrets> provisionResult)
    {
        var nodeAndSecrets = provisionResult.GetValueOrThrow();

        if (nodeAndSecrets.TryGetFileElseFolder(out var fileNode, out _, out var folderNode, out _))
        {
            throw new InvalidNodeTypeException(fileNode.Uid, LinkType.File);
        }

        return folderNode;
    }

    public static FolderSecrets GetFolderSecretsOrThrow(this Result<NodeAndSecrets, DegradedNodeAndSecrets> provisionResult)
    {
        var nodeAndSecrets = provisionResult.GetValueOrThrow();

        if (nodeAndSecrets.TryGetFileElseFolder(out var fileNode, out _, out _, out var folderSecrets))
        {
            throw new InvalidNodeTypeException(fileNode.Uid, LinkType.File);
        }

        return folderSecrets;
    }

    public static FileSecrets GetFileSecretsOrThrow(this Result<NodeAndSecrets, DegradedNodeAndSecrets> provisionResult)
    {
        var nodeAndSecrets = provisionResult.GetValueOrThrow();

        if (!nodeAndSecrets.TryGetFileElseFolder(out _, out var fileSecrets, out var folderNode, out _))
        {
            throw new InvalidNodeTypeException(folderNode.Uid, LinkType.Folder);
        }

        return fileSecrets;
    }

    public static bool TryGetFolderKeyElseError(
        this Result<NodeAndSecrets, DegradedNodeAndSecrets> provisionResult,
        [NotNullWhen(true)] out PgpPrivateKey? folderKey,
        [MaybeNullWhen(true)] out ProtonDriveError error)
    {
        if (!provisionResult.TryGetValueElseError(out var nodeAndSecrets, out var degradedNodeAndSecrets))
        {
            if (degradedNodeAndSecrets.TryGetFileElseFolder(out var degradedFileNode, out _, out var degradedFolderNode, out var degradedFolderSecrets))
            {
                folderKey = null;
                error = new ProtonDriveError(InvalidNodeTypeException.GetMessage(degradedFileNode.Id, LinkType.File));
                return false;
            }

            if (degradedFolderSecrets.Key is null)
            {
                folderKey = null;
                error = degradedFolderNode.Errors[0];
                return false;
            }

            folderKey = degradedFolderSecrets.Key;
            error = null;
            return true;
        }

        if (nodeAndSecrets.TryGetFileElseFolder(out var fileNode, out _, out _, out var folderSecrets))
        {
            folderKey = null;
            error = new ProtonDriveError(InvalidNodeTypeException.GetMessage(fileNode.Uid, LinkType.File));
            return false;
        }

        folderKey = folderSecrets.Key;
        error = null;
        return true;
    }

    public static Result<Node, DegradedNode> ToNodeResult(this Result<NodeAndSecrets, DegradedNodeAndSecrets> provisionResult)
    {
        return provisionResult.Convert(
            x => x.TryGetFileElseFolder(out var fileNode, out _, out var folderNode, out _) ? (Node)fileNode : folderNode,
            x => x.TryGetFileElseFolder(out var fileNode, out _, out var folderNode, out _) ? (DegradedNode)fileNode : folderNode);
    }
}
