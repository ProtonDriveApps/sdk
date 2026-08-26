namespace Proton.Drive.Sdk.Telemetry;

// Numeric values must match the UploadPerformanceMetric enum in proton.drive.sdk.proto.
public enum UploadPerformanceMetric
{
    Unspecified = 0,

    /// <summary>Throughput over active time for a file below the small size limit, in kibibytes per second.</summary>
    SmallFileThroughput = 1,

    /// <summary>Throughput over active time for a file at or above the small size limit, in kibibytes per second.</summary>
    LargeFileThroughput = 2,

    /// <summary>Share of total time spent running the pipeline, for uploads on the block route, in whole percent.</summary>
    LargeRouteActiveTimeShare = 3,

    /// <summary>Share of total time spent running the pipeline, for uploads on the small route, in whole percent.</summary>
    SmallRouteActiveTimeShare = 4,
}
