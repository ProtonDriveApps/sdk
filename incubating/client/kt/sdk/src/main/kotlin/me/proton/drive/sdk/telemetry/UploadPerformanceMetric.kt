package me.proton.drive.sdk.telemetry

enum class UploadPerformanceMetric {
    UNRECOGNIZED,
    UNSPECIFIED,
    SMALL_FILE_THROUGHPUT,
    LARGE_FILE_THROUGHPUT,
    LARGE_ROUTE_ACTIVE_TIME_SHARE,
    SMALL_ROUTE_ACTIVE_TIME_SHARE,
}
