using Proton.Drive.Sdk.Nodes;
using Proton.Sdk.Telemetry;

namespace Proton.Drive.Sdk.Telemetry;

public sealed class VerificationErrorEvent : IMetricEvent
{
    public string Name => "verificationError";

    public required EncryptedField Field { get; set; }

    public required ItemRecency Recency { get; set; }

    public required ItemCreator CreatedBy { get; set; }

    public bool? AddressMatchingDefaultShare { get; set; }

    public string? Error { get; set; }

    public required NodeUid Uid { get; set; }
}
