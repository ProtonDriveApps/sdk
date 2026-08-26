namespace Proton.Drive.Sdk.Nodes.Upload;

internal readonly record struct UploadMetricsContext(
    long UploadedByteCount,
    TimeSpan ActiveTime,
    TimeSpan PausedTime,
    RevisionUploadStatistics? Statistics);
