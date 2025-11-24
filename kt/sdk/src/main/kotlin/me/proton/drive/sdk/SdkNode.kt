package me.proton.drive.sdk

abstract class SdkNode(val parent: SdkNode?) : AutoCloseable {

    private var children: List<SdkNode> = emptyList()

    init {
        parent?.run { children += this }
    }

    override fun close() {
        parent?.run { children -= this }
    }
}
