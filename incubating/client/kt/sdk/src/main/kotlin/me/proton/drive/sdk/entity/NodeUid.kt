package me.proton.drive.sdk.entity

interface NodeUid : Uid

@Suppress("FunctionName")
fun NodeUid(value: String) = LegacyNodeUid(value)
