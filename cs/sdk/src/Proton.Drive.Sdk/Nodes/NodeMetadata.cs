using System.Diagnostics.CodeAnalysis;
using Proton.Drive.Sdk.Api.Shares;

namespace Proton.Drive.Sdk.Nodes;

internal readonly struct NodeMetadata
{
    private readonly (FileNode Node, FileSecrets Secrets)? _fileAndSecrets;
    private readonly (FolderNode Node, FolderSecrets Secrets)? _folderAndSecrets;

    public NodeMetadata(FileNode node, FileSecrets secrets, ShareId? membershipShareId, ReadOnlyMemory<byte> nameHashDigest)
    {
        _fileAndSecrets = (node, secrets);
        MembershipShareId = membershipShareId;
        NameHashDigest = nameHashDigest;
    }

    public NodeMetadata(FolderNode node, FolderSecrets secrets, ShareId? membershipShareId, ReadOnlyMemory<byte> nameHashDigest)
    {
        _folderAndSecrets = (node, secrets);
        MembershipShareId = membershipShareId;
        NameHashDigest = nameHashDigest;
    }

    public Node Node => _fileAndSecrets?.Node ?? (Node)_folderAndSecrets!.Value.Node;
    public NodeSecrets Secrets => _fileAndSecrets?.Secrets ?? (NodeSecrets)_folderAndSecrets!.Value.Secrets;
    public ShareId? MembershipShareId { get; }
    public ReadOnlyMemory<byte> NameHashDigest { get; }

    public static NodeMetadata FromFile(FileMetadata m) => new(m.Node, m.Secrets, m.MembershipShareId, m.NameHashDigest);
    public static NodeMetadata FromFolder(FolderMetadata m) => new(m.Node, m.Secrets, m.MembershipShareId, m.NameHashDigest);

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

    public void Deconstruct(out Node node, out NodeSecrets secrets, out ShareId? membershipShareId, out ReadOnlyMemory<byte> nameHashDigest)
    {
        node = Node;
        secrets = Secrets;
        membershipShareId = MembershipShareId;
        nameHashDigest = NameHashDigest;
    }
}
