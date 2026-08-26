package me.proton.drive.sdk.extension

import me.proton.drive.sdk.telemetry.UploadPerformanceMetric
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.UploadPerformanceMetric.toEnum() = when(this) {
    ProtonDriveSdk.UploadPerformanceMetric.UPLOAD_PERFORMANCE_METRIC_UNSPECIFIED ->
        UploadPerformanceMetric.UNSPECIFIED
    ProtonDriveSdk.UploadPerformanceMetric.UPLOAD_PERFORMANCE_METRIC_SMALL_FILE_THROUGHPUT ->
        UploadPerformanceMetric.SMALL_FILE_THROUGHPUT
    ProtonDriveSdk.UploadPerformanceMetric.UPLOAD_PERFORMANCE_METRIC_LARGE_FILE_THROUGHPUT ->
        UploadPerformanceMetric.LARGE_FILE_THROUGHPUT
    ProtonDriveSdk.UploadPerformanceMetric.UPLOAD_PERFORMANCE_METRIC_LARGE_ROUTE_ACTIVE_TIME_SHARE ->
        UploadPerformanceMetric.LARGE_ROUTE_ACTIVE_TIME_SHARE
    ProtonDriveSdk.UploadPerformanceMetric.UPLOAD_PERFORMANCE_METRIC_SMALL_ROUTE_ACTIVE_TIME_SHARE ->
        UploadPerformanceMetric.SMALL_ROUTE_ACTIVE_TIME_SHARE
    ProtonDriveSdk.UploadPerformanceMetric.UNRECOGNIZED ->
        UploadPerformanceMetric.UNRECOGNIZED
}
