package me.proton.drive.sdk.entity

abstract class LegacyUid(
    override val value: String,
    private val numberOfParts: Int,
) : Uid {

    internal val parts by lazy {
        value.split(SEPARATOR).also {
            check(it.size == numberOfParts) {
                "Malformed value for ${javaClass.simpleName}, should contains $numberOfParts parts: $value"
            }
        }
    }

    internal companion object {
        private const val SEPARATOR: String = "~"
        fun create(vararg parts: String) = parts.joinToString(SEPARATOR)
    }
}
