namespace Proton.Drive.Sdk.Api.Links;

internal sealed class LinkDetailsDto
{
    public required LinkDto Link { get; init; }
    public FolderDto? Folder { get; init; }

    public void Deconstruct(out LinkDto link, out FolderDto? folder)
    {
        link = Link;
        folder = Folder;
    }
}
