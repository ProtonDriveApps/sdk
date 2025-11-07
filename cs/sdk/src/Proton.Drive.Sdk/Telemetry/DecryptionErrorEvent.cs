using Proton.Sdk.Telemetry;

namespace Proton.Drive.Sdk.Telemetry;

public sealed class DecryptionErrorEvent : IMetricEvent
{
    public string Name => "decryptionError";

    public required VolumeType VolumeType { get; init; }

    public required EncryptedField Field { get; init; }

    public bool? FromBefore2024 { get; init; }

    public string? Error { get; init; }

    public required string Uid { get; init; }
}
