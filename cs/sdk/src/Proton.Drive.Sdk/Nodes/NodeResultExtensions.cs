using System.Diagnostics.CodeAnalysis;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

public static class NodeResultExtensions
{
    public static bool TryGetFileElseFolder(
        this RefResult<Node, DegradedNode> nodeResult,
        [NotNullWhen(true)] out RefResult<FileNode, DegradedFileNode>? fileResult,
        [NotNullWhen(false)] out RefResult<FolderNode, DegradedFolderNode>? folderResult)
    {
        if (!nodeResult.TryGetValueElseError(out var node, out var degradedNode))
        {
            if (degradedNode is DegradedFolderNode degradedFolderNode)
            {
                fileResult = null;
                folderResult = degradedFolderNode;
                return false;
            }

            fileResult = (DegradedFileNode)degradedNode;
            folderResult = null;
            return true;
        }

        if (node is FolderNode folderNode)
        {
            fileResult = null;
            folderResult = folderNode;
            return false;
        }

        fileResult = (FileNode)node;
        folderResult = null;
        return true;
    }
}
