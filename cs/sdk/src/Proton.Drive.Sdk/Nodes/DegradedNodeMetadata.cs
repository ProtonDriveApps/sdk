using System.Diagnostics.CodeAnalysis;
using Proton.Drive.Sdk.Api.Shares;

namespace Proton.Drive.Sdk.Nodes;

internal sealed class DegradedNodeMetadata
{
    private readonly (DegradedFileNode Node, DegradedFileSecrets Secrets)? _fileAndSecrets;
    private readonly (DegradedFolderNode Node, DegradedFolderSecrets Secrets)? _folderAndSecrets;

    public DegradedNodeMetadata(DegradedFileNode node, DegradedFileSecrets secrets, ShareId? membershipShareId, ReadOnlyMemory<byte> nameHashDigest)
    {
        _fileAndSecrets = (node, secrets);
        MembershipShareId = membershipShareId;
        NameHashDigest = nameHashDigest;
    }

    public DegradedNodeMetadata(DegradedFolderNode node, DegradedFolderSecrets secrets, ShareId? membershipShareId, ReadOnlyMemory<byte> nameHashDigest)
    {
        _folderAndSecrets = (node, secrets);
        MembershipShareId = membershipShareId;
        NameHashDigest = nameHashDigest;
    }

    public DegradedNode Node => _fileAndSecrets?.Node ?? (DegradedNode)_folderAndSecrets!.Value.Node;
    public DegradedNodeSecrets Secrets => _fileAndSecrets?.Secrets ?? (DegradedNodeSecrets)_folderAndSecrets!.Value.Secrets;
    public ShareId? MembershipShareId { get; }
    public ReadOnlyMemory<byte> NameHashDigest { get; }

    public static DegradedNodeMetadata FromFile(DegradedFileMetadata m) => new(m.Node, m.Secrets, m.MembershipShareId, m.NameHashDigest);
    public static DegradedNodeMetadata FromFolder(DegradedFolderMetadata m) => new(m.Node, m.Secrets, m.MembershipShareId, m.NameHashDigest);

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
