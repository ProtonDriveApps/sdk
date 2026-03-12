namespace Proton.Drive.Sdk.Nodes;

public class FileUploadMetadata
{
    public DateTimeOffset? LastModificationTime { get; init; }
    public IEnumerable<AdditionalMetadataProperty>? AdditionalMetadata { get; init; }
}
