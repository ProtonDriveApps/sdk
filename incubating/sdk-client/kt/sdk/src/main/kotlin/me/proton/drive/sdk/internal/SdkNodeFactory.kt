package me.proton.drive.sdk.internal

import me.proton.drive.sdk.SdkNode

class SdkNodeFactory<T>(
    parent: SdkNode, private val bridge: T
) : SdkNode(parent) {
    suspend fun <R : SdkNode> create(block: suspend T.() -> R): R = use {
        bridge.block()
    }
}

suspend fun <T, R : SdkNode> SdkNode.factory(
    bridge: T,
    block: suspend T.() -> R,
): R = SdkNodeFactory(this, bridge).create(block)
