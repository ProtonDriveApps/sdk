using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Api.Folders;
using Proton.Drive.Sdk.Api.Photos;

namespace Proton.Drive.Sdk.Api.Links;

internal sealed class LinkDetailsDto
{
    public required LinkDto Link { get; init; }
    public FolderDto? Folder { get; init; }
    public FileDto? File { get; init; }
    public PhotoDto? Photo { get; init; }
    public FolderDto? Album { get; init; }
    public LinkSharingDto? Sharing { get; init; }
    public ShareMembershipSummaryDto? Membership { get; init; }

    public void Deconstruct(
        out LinkDto link,
        out FolderDto? folder,
        out FileDto? file,
        out PhotoDto? photo,
        out FolderDto? album,
        out LinkSharingDto? sharing,
        out ShareMembershipSummaryDto? membership)
    {
        link = Link;
        folder = Folder;
        file = File;
        photo = Photo;
        album = Album;
        sharing = Sharing;
        membership = Membership;
    }
}
