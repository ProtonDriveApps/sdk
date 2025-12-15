package me.proton.drive.sdk.internal

import kotlinx.coroutines.Job

object JniJob {

    @JvmStatic
    external fun getCancelPointer(): Long

    @JvmStatic
    external fun createWeakRef(job: Job): Long
}

fun Job.createWeakRef() = JniJob.createWeakRef(this)
