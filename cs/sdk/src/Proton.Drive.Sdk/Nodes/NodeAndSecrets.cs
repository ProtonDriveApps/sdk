using System.Diagnostics.CodeAnalysis;

namespace Proton.Drive.Sdk.Nodes;

internal readonly struct NodeAndSecrets
{
    private readonly (FileNode Node, FileSecrets Secrets)? _fileAndSecrets;
    private readonly (FolderNode Node, FolderSecrets Secrets)? _folderAndSecrets;

    public NodeAndSecrets(FileNode node, FileSecrets secrets)
    {
        _fileAndSecrets = (node, secrets);
    }

    public NodeAndSecrets(FolderNode node, FolderSecrets secrets)
    {
        _folderAndSecrets = (node, secrets);
    }

    public bool TryGetFileElseFolder(
        [MaybeNullWhen(false)] out FileNode fileNode,
        [MaybeNullWhen(false)] out FileSecrets fileSecrets,
        [MaybeNullWhen(true)] out FolderNode folderNode,
        [MaybeNullWhen(true)] out FolderSecrets folderSecrets)
    {
        if (_fileAndSecrets is null)
        {
            (folderNode, folderSecrets) = _folderAndSecrets!.Value;
            fileNode = null;
            fileSecrets = null;
            return false;
        }

        (fileNode, fileSecrets) = _fileAndSecrets.Value;
        folderNode = null;
        folderSecrets = null;
        return true;
    }
}
