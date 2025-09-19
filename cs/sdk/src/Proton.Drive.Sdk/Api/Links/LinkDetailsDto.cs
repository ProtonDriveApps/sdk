using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Api.Folders;

namespace Proton.Drive.Sdk.Api.Links;

internal sealed class LinkDetailsDto
{
    public required LinkDto Link { get; init; }
    public FolderDto? Folder { get; init; }
    public FileDto? File { get; init; }
    public LinkSharingDto? Sharing { get; init; }
    public ShareMembershipSummaryDto? Membership { get; init; }

    public void Deconstruct(out LinkDto link, out FolderDto? folder, out FileDto? file, out LinkSharingDto? sharing, out ShareMembershipSummaryDto? membership)
    {
        link = Link;
        folder = Folder;
        file = File;
        sharing = Sharing;
        membership = Membership;
    }
}
