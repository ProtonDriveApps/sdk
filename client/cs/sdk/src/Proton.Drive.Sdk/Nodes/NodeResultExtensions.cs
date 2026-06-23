using System.Diagnostics.CodeAnalysis;

namespace Proton.Drive.Sdk.Nodes;

public static class NodeResultExtensions
{
    public static bool TryGetFileElseFolder(
        this Node node,
        [NotNullWhen(true)] out FileNode? fileNode,
        [NotNullWhen(false)] out FolderNode? folderNode)
    {
        if (node is FolderNode folder)
        {
            fileNode = null;
            folderNode = folder;
            return false;
        }

        fileNode = (FileNode)node;
        folderNode = null;
        return true;
    }
}
