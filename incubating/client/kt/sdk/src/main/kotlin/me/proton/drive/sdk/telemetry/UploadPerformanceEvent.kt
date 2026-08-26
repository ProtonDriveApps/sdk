package me.proton.drive.sdk.telemetry

data class UploadPerformanceEvent(
    val metric: UploadPerformanceMetric,
    val value: Long,
    val uploadRoute: UploadRoute,
    val sizeClass: UploadSizeClass,
    val blockCount: UploadBlockCount,
)
