using System.Diagnostics.CodeAnalysis;

namespace Proton.Drive.Sdk.Nodes;

internal sealed class DegradedNodeAndSecrets
{
    private readonly (DegradedFileNode Node, DegradedFileSecrets Secrets)? _fileAndSecrets;
    private readonly (DegradedFolderNode Node, DegradedFolderSecrets Secrets)? _folderAndSecrets;

    public DegradedNodeAndSecrets(DegradedFileNode node, DegradedFileSecrets secrets)
    {
        _fileAndSecrets = (node, secrets);
    }

    public DegradedNodeAndSecrets(DegradedFolderNode node, DegradedFolderSecrets secrets)
    {
        _folderAndSecrets = (node, secrets);
    }

    public bool TryGetFileElseFolder(
        [MaybeNullWhen(false)] out DegradedFileNode fileNode,
        [MaybeNullWhen(false)] out DegradedFileSecrets fileSecrets,
        [MaybeNullWhen(true)] out DegradedFolderNode folderNode,
        [MaybeNullWhen(true)] out DegradedFolderSecrets folderSecrets)
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
