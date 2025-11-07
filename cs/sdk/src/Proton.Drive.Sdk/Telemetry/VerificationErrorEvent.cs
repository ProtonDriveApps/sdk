using Proton.Sdk.Telemetry;

namespace Proton.Drive.Sdk.Telemetry;

public sealed class VerificationErrorEvent : IMetricEvent
{
    public string Name => "verificationError";

    public required VolumeType VolumeType { get; set; }

    public required EncryptedField Field { get; set; }

    public bool? FromBefore2024 { get; set; }

    public bool? AddressMatchingDefaultShare { get; set; }

    public string? Error { get; set; }

    public required string Uid { get; set; }
}
