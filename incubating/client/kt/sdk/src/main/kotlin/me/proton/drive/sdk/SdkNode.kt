package me.proton.drive.sdk

abstract class SdkNode(val parent: SdkNode?) : AutoCloseable {

    private var children: List<SdkNode> = emptyList()

    init {
        parent?.children += this
    }

    override fun close() {
        parent?.children -= this
    }
}
