namespace Proton.Drive.Sdk.Nodes;

public class FileUploadMetadata
{
    public required string MediaType { get; init; }
    public DateTime? LastModificationTime { get; init; }
    public IEnumerable<AdditionalMetadataProperty>? AdditionalMetadata { get; init; }
    public bool OverrideExistingDraftByOtherClient { get; init; }
}
