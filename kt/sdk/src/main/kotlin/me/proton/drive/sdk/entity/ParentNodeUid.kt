package me.proton.drive.sdk.entity

interface ParentNodeUid : NodeUid

@Suppress("FunctionName")
fun ParentNodeUid(value: String):ParentNodeUid = LegacyParentNodeUid(value)
