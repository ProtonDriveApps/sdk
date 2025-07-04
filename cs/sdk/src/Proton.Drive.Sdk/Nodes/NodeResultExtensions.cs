using System.Diagnostics.CodeAnalysis;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

public static class NodeResultExtensions
{
    public static bool TryGetFileElseFolder(
        this Result<Node, DegradedNode> nodeResult,
        [NotNullWhen(true)] out Result<FileNode, DegradedFileNode>? fileResult,
        [NotNullWhen(false)] out Result<FolderNode, DegradedFolderNode>? folderResult)
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
