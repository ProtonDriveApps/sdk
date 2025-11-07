using Proton.Sdk.Telemetry;

namespace Proton.Drive.Sdk.Telemetry;

public sealed class BlockVerificationErrorEvent : IMetricEvent
{
    public string Name => "blockVerificationError";

    public bool RetryHelped { get; init; }
}
