using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Search.Abstractions;
using Proton.Sdk;
using DriveAuthor = Proton.Drive.Sdk.Author;
namespace Proton.Drive.Sdk.Search;

internal static class SearchNodeMapper
{
    internal static FfiNode ToFfiNode(Nodes.NodeMetadata metadata)
    {
        var node = metadata.Node;

        var (name, nameError) = MapName(node.Name);
        var modificationTime = MapModificationTime(node);

        return new FfiNode(
            SearchNodeUidMapping.ToSearchNodeUid(node.Uid),
            node.ParentUid is { } parentUid ? SearchNodeUidMapping.ToSearchNodeUid(parentUid) : null,
            node.TreeEventScopeId.ToString(),
            MapKind(node),
            name,
            nameError,
            ToFfiAuthor(node.NameAuthor),
            ToFfiAuthor(node.KeyAuthor),
            ToSearchMemberRole(node.DirectRole),
            MapMembership(node.Membership),
            node.OwnedBy.Email,
            node.OwnedBy.Organization,
            node.IsShared,
            node.IsSharedByUrl,
            ToUnixSeconds(node.CreationTime),
            modificationTime,
            node.TrashTime is { } trashTime ? ToUnixSeconds(trashTime) : null,
            [.. node.Errors.Select(static error => error.Message ?? error.ToString() ?? string.Empty)]);
    }

    private static (string Name, string? NameError) MapName(Result<string, ProtonDriveError> name)
    {
        if (name.TryGetValueElseError(out var decryptedName, out var error))
        {
            return (decryptedName, null);
        }

        return (error.Message ?? "?", error.Message);
    }

    private static long MapModificationTime(Nodes.Node node)
    {
        if (node is FileNode fileNode)
        {
            return ToUnixSeconds(
                fileNode.ActiveRevision.ClaimedModificationTime ?? fileNode.CreationTime);
        }

        return ToUnixSeconds(node.CreationTime);
    }

    private static FfiNodeKind MapKind(Nodes.Node node)
        => node switch
        {
            PhotoNode photoNode => new FfiNodeKind.Photo(ToFfiFile(photoNode)),
            FileNode fileNode => new FfiNodeKind.File(ToFfiFile(fileNode)),
            AlbumNode => new FfiNodeKind.Album(),
            FolderNode => new FfiNodeKind.Folder(default),
            _ => throw new SearchNodeProviderException($"Unsupported node type: {node.GetType().Name}"),
        };

    private static FfiFile ToFfiFile(FileNode fileNode)
    {
        var revision = fileNode.ActiveRevision;

        var claimedModificationTimeSeconds = revision.ClaimedModificationTime is { } claimedModificationTime
            ? ToUnixSeconds(claimedModificationTime)
            : default(long?);

        return new FfiFile(
            fileNode.MediaType,
            checked((ulong)fileNode.TotalStorageSize),
            new FfiRevision(
                revision.Uid.ToString(),
                ToSearchRevisionState(revision.State),
                ToUnixSeconds(revision.CreationTime),
                ToFfiAuthor(revision.ContentAuthor ?? Result<DriveAuthor, SignatureVerificationError>.Success(DriveAuthor.Anonymous)),
                checked((ulong)Math.Max(revision.StorageSize, 0)),
                false,
                revision.ClaimedSize is { } claimedSize ? checked((ulong)claimedSize) : null,
                claimedModificationTimeSeconds,
                MapSha1Digest(revision.ClaimedDigests.Sha1),
                revision.ClaimedDigests.Sha1Verified,
                null));
    }

    private static FfiMembership? MapMembership(Nodes.Membership? membership)
    {
        if (membership is null)
        {
            return null;
        }

        return new FfiMembership(
            ToSearchMemberRole(membership.Role),
            ToUnixSeconds(membership.InviteTime),
            ToFfiAuthor(membership.SharedBy));
    }

    private static FfiAuthor ToFfiAuthor(Result<DriveAuthor, SignatureVerificationError> author)
    {
        if (author.TryGetValueElseError(out var value, out var error))
        {
            return new FfiAuthor(
                value == DriveAuthor.Anonymous ? null : value.EmailAddress,
                null);
        }

        return new FfiAuthor(
            error.ClaimedAuthor == DriveAuthor.Anonymous ? null : error.ClaimedAuthor.EmailAddress,
            error.Message);
    }

    private static string? MapSha1Digest(ReadOnlyMemory<byte>? sha1)
        => sha1 is { IsEmpty: false } digest
            ? Convert.ToHexString(digest.Span).ToLowerInvariant()
            : null;

    private static MemberRole ToSearchMemberRole(Nodes.MemberRole role)
        => (MemberRole)(int)role;

    private static RevisionState ToSearchRevisionState(Nodes.RevisionState state)
        => state switch
        {
            Nodes.RevisionState.Active => RevisionState.Active,
            Nodes.RevisionState.Superseded => RevisionState.Superseded,
            _ => throw new ArgumentOutOfRangeException(nameof(state), state, null),
        };

    private static long ToUnixSeconds(DateTime dateTime)
        => new DateTimeOffset(dateTime.ToUniversalTime()).ToUnixTimeSeconds();
}
