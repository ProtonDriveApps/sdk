using Proton.Sdk.Telemetry;

namespace Proton.Drive.Sdk.Telemetry;

public sealed class DownloadEvent : IMetricEvent
{
    public string Name => "download";

    public required VolumeType VolumeType { get; init; }

    public required long DownloadedSize { get; init; }

    public long? ClaimedFileSize { get; init; }

    public DownloadError? Error { get; init; }

    public string? OriginalError { get; init; }
}
