using Proton.Sdk.Telemetry;

namespace Proton.Drive.Sdk.Telemetry;

public sealed class DownloadEvent : IMetricEvent
{
    public string Name => "download";

    public required VolumeType VolumeType { get; init; }

    public long DownloadedSize { get; set; }

    public long ClaimedFileSize { get; set; }

    public DownloadError? Error { get; set; }

    public string? OriginalError { get; set; }
}
