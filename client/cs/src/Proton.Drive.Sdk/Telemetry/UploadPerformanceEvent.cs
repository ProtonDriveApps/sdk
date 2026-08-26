using Proton.Sdk.Telemetry;

namespace Proton.Drive.Sdk.Telemetry;

/// <summary>
/// One histogram observation of per-file upload performance. The SDK derives the value so that every client
/// reports the same thing; clients only map <see cref="Metric"/> to its registered metric name and turn the one
/// of <see cref="UploadRoute"/>, <see cref="SizeClass"/> and <see cref="BlockCount"/> that metric is registered
/// with into its label.
/// </summary>
public sealed class UploadPerformanceEvent : IMetricEvent
{
    public string Name => "uploadPerformance";

    public required UploadPerformanceMetric Metric { get; set; }

    /// <summary>
    /// Already expressed in the unit of the metric's registered buckets.
    /// </summary>
    public required long Value { get; set; }

    public required UploadRoute UploadRoute { get; set; }

    public required UploadSizeClass SizeClass { get; set; }

    public required UploadBlockCount BlockCount { get; set; }
}
