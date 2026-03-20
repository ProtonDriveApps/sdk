using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Links;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal static class NodeMetadataResultExtensions
{
    public static Node GetNodeOrThrow(this Result<NodeMetadata, DegradedNodeMetadata> metadataResult)
    {
        var metadata = metadataResult.GetValueOrThrow();

        return metadata.TryGetFileElseFolder(out var fileNode, out _, out var folderNode, out _) ? fileNode : folderNode;
    }

    public static FolderNode GetFolderNodeOrThrow(this Result<NodeMetadata, DegradedNodeMetadata> metadataResult)
    {
        var metadata = metadataResult.GetValueOrThrow();

        if (metadata.TryGetFileElseFolder(out var fileNode, out _, out var folderNode, out _))
        {
            throw new InvalidNodeTypeException(fileNode.Uid, LinkType.File);
        }

        return folderNode;
    }

    public static FolderSecrets GetFolderSecretsOrThrow(this Result<NodeMetadata, DegradedNodeMetadata> metadataResult)
    {
        var metadata = metadataResult.GetValueOrThrow();

        if (metadata.TryGetFileElseFolder(out var fileNode, out _, out _, out var folderSecrets))
        {
            throw new InvalidNodeTypeException(fileNode.Uid, LinkType.File);
        }

        return folderSecrets;
    }

    public static Result<FileSecrets, DegradedFileSecrets> GetFileSecretsOrThrow(this Result<NodeMetadata, DegradedNodeMetadata> metadataResult)
    {
        if (metadataResult.TryGetValueElseError(out var metadata, out var degradedMetadata))
        {
            if (!metadata.TryGetFileElseFolder(out _, out var fileSecrets, out var folderNode, out _))
            {
                throw new InvalidNodeTypeException(folderNode.Uid, LinkType.Folder);
            }

            return fileSecrets;
        }
        else
        {
            if (!degradedMetadata.TryGetFileElseFolder(out _, out var degradedFileSecrets, out var folderNode, out _))
            {
                throw new InvalidNodeTypeException(folderNode.Uid, LinkType.Folder);
            }

            return degradedFileSecrets;
        }
    }

    public static PgpPrivateKey GetFolderKeyOrThrow(this Result<NodeMetadata, DegradedNodeMetadata> metadataResult)
    {
        if (!metadataResult.TryGetValueElseError(out var nodeAndSecrets, out var degradedNodeAndSecrets))
        {
            if (degradedNodeAndSecrets.TryGetFileElseFolder(out var degradedFileNode, out _, out var degradedFolderNode, out var degradedFolderSecrets))
            {
                throw new InvalidNodeTypeException(degradedFileNode.Uid, LinkType.File);
            }

            if (degradedFolderSecrets.Key is not { } folderKey)
            {
                throw new ProtonDriveException($"Degraded node does not have a key: {degradedFolderNode.Errors[0]}");
            }

            return folderKey;
        }

        if (nodeAndSecrets.TryGetFileElseFolder(out var fileNode, out _, out _, out var folderSecrets))
        {
            throw new InvalidNodeTypeException(fileNode.Uid, LinkType.File);
        }

        return folderSecrets.Key;
    }

    public static Result<Node, DegradedNode> ToNodeResult(this Result<NodeMetadata, DegradedNodeMetadata> metadataResult)
    {
        return metadataResult.Convert(metadata => metadata.Node, metadata => metadata.Node);
    }

    public static Result<NodeSecrets, DegradedNodeSecrets> ToSecretsResult(this Result<NodeMetadata, DegradedNodeMetadata> metadataResult)
    {
        return metadataResult.Convert(metadata => metadata.Secrets, metadata => metadata.Secrets);
    }
}
