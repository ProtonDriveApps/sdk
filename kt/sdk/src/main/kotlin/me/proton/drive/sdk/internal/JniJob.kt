package me.proton.drive.sdk.internal

import kotlinx.coroutines.Job

object JniJob {

    @JvmStatic
    external fun getCancelPointer(): Long

    @JvmStatic
    external fun createWeakGlobalRef(job: Job): Long

    @JvmStatic
    external fun deleteWeakGlobalRef(ref: Long)
}
