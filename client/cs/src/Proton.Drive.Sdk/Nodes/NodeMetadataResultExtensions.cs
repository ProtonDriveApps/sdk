using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Links;

namespace Proton.Drive.Sdk.Nodes;

internal static class NodeMetadataResultExtensions
{
    extension(NodeMetadata metadata)
    {
        public Node GetNodeOrThrow()
        {
            return metadata.TryGetFileElseFolder(out var fileNode, out _, out var folderNode, out _) ? fileNode : folderNode;
        }

        public FolderNode GetFolderNodeOrThrow()
        {
            return !metadata.TryGetFileElseFolder(out var fileNode, out _, out var folderNode, out _)
                ? folderNode
                : throw new InvalidNodeTypeException(fileNode.Uid, LinkType.File);
        }

        public FolderSecrets GetFolderSecretsOrThrow()
        {
            return !metadata.TryGetFileElseFolder(out var fileNode, out _, out _, out var folderSecrets)
                ? folderSecrets
                : throw new InvalidNodeTypeException(fileNode.Uid, LinkType.File);
        }

        public FileSecrets GetFileSecretsOrThrow()
        {
            return metadata.TryGetFileElseFolder(out _, out var fileSecrets, out var folderNode, out _)
                ? fileSecrets
                : throw new InvalidNodeTypeException(folderNode.Uid, LinkType.Folder);
        }

        public PgpPrivateKey GetFolderKeyOrThrow()
        {
            if (metadata.TryGetFileElseFolder(out var fileNode, out _, out _, out var folderSecrets))
            {
                throw new InvalidNodeTypeException(fileNode.Uid, LinkType.File);
            }

            return folderSecrets.Key ?? throw new InvalidOperationException($"Folder node does not have a key: {metadata.Node.Errors[0]}");
        }
    }
}
