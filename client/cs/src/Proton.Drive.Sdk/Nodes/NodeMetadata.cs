using System.Diagnostics.CodeAnalysis;
using Proton.Drive.Sdk.Api.Shares;

namespace Proton.Drive.Sdk.Nodes;

internal readonly struct NodeMetadata
{
    private readonly Either<(FileNode Node, FileOperationData OperationData), (FolderNode Node, FolderOperationData OperationData)> _nodeAndOperationData;

    public NodeMetadata(FileNode node, FileOperationData operationData, ShareId? membershipShareId, ReadOnlyMemory<byte> nameHashDigest)
    {
        _nodeAndOperationData = (node, operationData);
        MembershipShareId = membershipShareId;
        NameHashDigest = nameHashDigest;
    }

    public NodeMetadata(FolderNode node, FolderOperationData operationData, ShareId? membershipShareId, ReadOnlyMemory<byte> nameHashDigest)
    {
        _nodeAndOperationData = (node, operationData);
        MembershipShareId = membershipShareId;
        NameHashDigest = nameHashDigest;
    }

    public Node Node
        => _nodeAndOperationData.TryGetFirstElseSecond(out var file, out var folder) ? file.Node : folder.Node;

    public NodeOperationData OperationData
        => _nodeAndOperationData.TryGetFirstElseSecond(out var file, out var folder) ? file.OperationData : folder.OperationData;

    public ShareId? MembershipShareId { get; }
    public ReadOnlyMemory<byte> NameHashDigest { get; }

    public static NodeMetadata FromFile(FileMetadata m) => new(m.Node, m.OperationData, m.MembershipShareId, m.NameHashDigest);
    public static NodeMetadata FromFolder(FolderMetadata m) => new(m.Node, m.OperationData, m.MembershipShareId, m.NameHashDigest);

    public bool TryGetFileElseFolder(
        [MaybeNullWhen(false)] out FileNode fileNode,
        [MaybeNullWhen(false)] out FileOperationData fileOperationData,
        [MaybeNullWhen(true)] out FolderNode folderNode,
        [MaybeNullWhen(true)] out FolderOperationData folderOperationData)
    {
        if (!_nodeAndOperationData.TryGetFirstElseSecond(out var file, out var folder))
        {
            (folderNode, folderOperationData) = folder;
            fileNode = null;
            fileOperationData = null;
            return false;
        }

        (fileNode, fileOperationData) = file;
        folderNode = null;
        folderOperationData = null;
        return true;
    }

    public void Deconstruct(out Node node, out NodeOperationData operationData, out ShareId? membershipShareId, out ReadOnlyMemory<byte> nameHashDigest)
    {
        node = Node;
        operationData = OperationData;
        membershipShareId = MembershipShareId;
        nameHashDigest = NameHashDigest;
    }
}
