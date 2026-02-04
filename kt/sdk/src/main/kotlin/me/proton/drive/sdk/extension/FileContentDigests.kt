package me.proton.drive.sdk.extension

import me.proton.drive.sdk.entity.FileContentDigests
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.FileContentDigests.toEntity() = FileContentDigests(
    sha1 = if (sha1.isEmpty) null else sha1.toByteArray().toHexString(),
)

private fun ByteArray.toHexString(): String = joinToString("") { "%02x".format(it) }
