using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

public sealed record DegradedFileNode : DegradedNode
{
    public required string MediaType { get; init; }

    public required DegradedRevision? ActiveRevision { get; init; }

    public required long TotalStorageQuotaUsage { get; init; }
}
