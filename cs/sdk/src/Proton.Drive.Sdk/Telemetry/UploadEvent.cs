using System.Text.Json.Serialization;
using Proton.Sdk.Telemetry;

namespace Proton.Drive.Sdk.Telemetry;

public sealed class UploadEvent : IMetricEvent
{
    public string Name => "upload";

    public required VolumeType VolumeType { get; set; }

    public required long UploadedSize { get; set; }

    public required long ApproximateUploadedSize { get; set; }

    public required long ExpectedSize { get; set; }

    public UploadError? Error { get; set; }

    [JsonIgnore]
    public Exception? OriginalError { get; set; }
}
