using Proton.Drive.Sdk.Api.Folders;
using Proton.Drive.Sdk.Api.Links;
using Proton.Photos.Sdk.Api.Photos;

namespace Proton.Photos.Sdk.Api;

internal sealed class PhotoLinkDetailsDto
{
    public required LinkDto Link { get; init; }
    public PhotoDto? Photo { get; init; }
    public FolderDto? Album { get; init; }
    public FolderDto? Folder { get; init; }
    public LinkSharingDto? Sharing { get; init; }
    public ShareMembershipSummaryDto? Membership { get; init; }

    public void Deconstruct(out LinkDto link, out PhotoDto? photo, out FolderDto? album, out FolderDto? folder, out LinkSharingDto? sharing, out ShareMembershipSummaryDto? membership)
    {
        link = Link;
        photo = Photo;
        album = Album;
        folder = Folder;
        sharing = Sharing;
        membership = Membership;
    }

    public LinkDetailsDto ToLinkDetailsDto()
    {
        return new LinkDetailsDto
        {
            Link = Link,
            Folder = Folder ?? Album,
            File = Photo,
            Sharing = Sharing,
            Membership = Membership,
        };
    }
}
