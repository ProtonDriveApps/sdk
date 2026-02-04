package me.proton.drive.sdk.entity

sealed interface NodeResult {
    data class Value(val node: Node) : NodeResult
    data class Error(val node: DegradedNode) : NodeResult
}
