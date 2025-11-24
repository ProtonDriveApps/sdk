package me.proton.drive.sdk.extension

import kotlinx.coroutines.CancellableContinuation
import me.proton.drive.sdk.converter.FileThumbnailListConverter
import me.proton.drive.sdk.converter.LongConverter
import me.proton.drive.sdk.converter.StringConverter
import me.proton.drive.sdk.converter.UploadResultConverter
import me.proton.drive.sdk.internal.ContinuationUnitOrErrorResponse
import me.proton.drive.sdk.internal.ContinuationValueOrErrorResponse
import me.proton.drive.sdk.internal.ResponseCallback
import proton.drive.sdk.ProtonDriveSdk
import proton.drive.sdk.ProtonDriveSdk.UploadResult

fun CancellableContinuation<Unit>.toUnitResponse(): ResponseCallback =
    ContinuationUnitOrErrorResponse(this)

val UnitResponseCallback: (CancellableContinuation<Unit>) -> ResponseCallback =
    CancellableContinuation<Unit>::toUnitResponse

fun CancellableContinuation<Long>.toLongResponse(): ResponseCallback =
    ContinuationValueOrErrorResponse(this, LongConverter())

val LongResponseCallback: (CancellableContinuation<Long>) -> ResponseCallback =
    CancellableContinuation<Long>::toLongResponse

fun CancellableContinuation<String>.toStringResponse(): ResponseCallback =
    ContinuationValueOrErrorResponse(this, StringConverter())

val StringResponseCallback: (CancellableContinuation<String>) -> ResponseCallback =
    CancellableContinuation<String>::toStringResponse

fun CancellableContinuation<UploadResult>.toUploadResultResponse(): ResponseCallback =
    ContinuationValueOrErrorResponse(this, UploadResultConverter())

val UploadResultResponseCallback: (CancellableContinuation<UploadResult>) -> ResponseCallback =
    CancellableContinuation<UploadResult>::toUploadResultResponse

fun CancellableContinuation<ProtonDriveSdk.FileThumbnailList>.toFileThumbnailListResponse(): ResponseCallback =
    ContinuationValueOrErrorResponse(this, FileThumbnailListConverter())

val FileThumbnailListResponseCallback: (CancellableContinuation<ProtonDriveSdk.FileThumbnailList>) -> ResponseCallback =
    CancellableContinuation<ProtonDriveSdk.FileThumbnailList>::toFileThumbnailListResponse
