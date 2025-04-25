using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

public sealed class DegradedFileNode : DegradedNode
{
    public required string MediaType { get; init; }

    public required Revision? ActiveRevision { get; init; }

    public required long TotalStorageQuotaUsage { get; init; }

    public FileNode ToNode(string substituteName, Revision substituteRevision)
    {
        return new FileNode
        {
            Uid = Id,
            ParentUid = ParentId,
            MediaType = MediaType,
            Name = Name.TryGetValue(out var name)
                ? name
                : substituteName,
            NameAuthor = NameAuthor,
            Author = Author,
            ActiveRevision = ActiveRevision ?? substituteRevision,
            IsTrashed = false,
            TotalStorageQuotaUsage = TotalStorageQuotaUsage,
        };
    }
}
