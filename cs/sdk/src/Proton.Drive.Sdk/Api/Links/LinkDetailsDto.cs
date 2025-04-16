namespace Proton.Drive.Sdk.Api.Links;

internal sealed class LinkDetailsDto
{
    public required LinkDto Link { get; init; }
    public FolderDto? Folder { get; init; }
    public FileDto? File { get; init; }
    public ShareMembershipSummaryDto? Membership { get; init; }

    public void Deconstruct(out LinkDto link, out FolderDto? folder, out FileDto? file, out ShareMembershipSummaryDto? membership)
    {
        link = Link;
        folder = Folder;
        file = File;
        membership = Membership;
    }
}
