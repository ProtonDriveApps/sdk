package me.proton.drive.sdk

open class OperationAbortedException(message: String, cause: Throwable) : Exception(message, cause)

class UploadAbortedException(cause: Throwable) :
    OperationAbortedException("Upload was aborted and cannot be resumed", cause)

class DownloadAbortedException(cause: Throwable) :
    OperationAbortedException("Download was aborted and cannot be resumed", cause)
