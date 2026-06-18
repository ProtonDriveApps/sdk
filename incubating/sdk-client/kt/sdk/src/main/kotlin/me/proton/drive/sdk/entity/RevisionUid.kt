package me.proton.drive.sdk.entity

interface RevisionUid : Uid

@Suppress("FunctionName")
fun RevisionUid(value: String) = LegacyRevisionUid(value)
