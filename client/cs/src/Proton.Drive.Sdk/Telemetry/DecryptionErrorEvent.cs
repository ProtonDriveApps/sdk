using Proton.Drive.Sdk.Nodes;
using Proton.Sdk.Telemetry;

namespace Proton.Drive.Sdk.Telemetry;

public sealed class DecryptionErrorEvent : IMetricEvent
{
    public string Name => "decryptionError";

    public required EncryptedField Field { get; init; }

    public required ItemRecency Recency { get; init; }

    public required ItemCreator CreatedBy { get; init; }

    public string? Error { get; init; }

    public required NodeUid Uid { get; init; }
}
