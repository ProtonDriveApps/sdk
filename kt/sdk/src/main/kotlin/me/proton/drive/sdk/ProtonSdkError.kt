package me.proton.drive.sdk

import me.proton.drive.sdk.entity.NodeUid
import me.proton.drive.sdk.entity.RevisionUid

data class ProtonSdkError(
    val message: String,
    val type: String,
    val domain: ErrorDomain = ErrorDomain.Undefined,
    val primaryCode: Long? = null,
    val secondaryCode: Long? = null,
    val context: String? = null,
    val innerError: ProtonSdkError? = null,
    val additionalData: Data<Any>? = null,
) {

    enum class ErrorDomain {
        Undefined,
        SuccessfulCancellation,
        Api,
        Network,
        Transport,
        Serialization,
        Cryptography,
        DataIntegrity,
        BusinessLogic,
        UNRECOGNIZED,
    }

    sealed interface Data<out S> {
        fun toSafe(): S

        data class NodeNameConflict(
            val conflictingNodeIsFileDraft: Boolean?,
            val conflictingNodeUid: NodeUid?,
            val conflictingRevisionUid: RevisionUid?,
        ) : Data<NodeNameConflict> {
            override fun toSafe() = this
        }

        data class MissingContentBlock(
            val blockNumber: Int?,
        ) : Data<MissingContentBlock> {
            override fun toSafe() = this
        }

        data class ContentSizeMismatch(
            val uploadedSize: Long?,
            val expectedSize: Long?,
        ) : Data<ContentSizeMismatch.Safe> {
            data class Safe(val delta: Long?)

            override fun toSafe() = Safe(
                delta = if (uploadedSize != null && expectedSize != null) {
                    expectedSize - uploadedSize
                } else {
                    null
                }
            )
        }

        data class ThumbnailCountMismatch(
            val uploadedBlockCount: Int?,
            val expectedBlockCount: Int?,
        ) : Data<ThumbnailCountMismatch> {
            override fun toSafe() = this
        }

        class ChecksumMismatch(
            val actualChecksum: ByteArray?,
            val expectedChecksum: ByteArray?,
        ) : Data<ChecksumMismatch.Safe> {
            data class Safe(val actualChecksumPrefix: String?, val expectedChecksumPrefix: String?)

            override fun toSafe() = Safe(
                actualChecksumPrefix = actualChecksum?.toHexPrefix(),
                expectedChecksumPrefix = expectedChecksum?.toHexPrefix(),
            )

            override fun equals(other: Any?): Boolean {
                if (this === other) {
                    return true
                }
                if (other !is ChecksumMismatch) {
                    return false
                }
                return actualChecksum.contentEquals(other.actualChecksum) &&
                        expectedChecksum.contentEquals(other.expectedChecksum)
            }

            override fun hashCode(): Int {
                var result = actualChecksum.contentHashCode()
                result = 31 * result + expectedChecksum.contentHashCode()
                return result
            }

            override fun toString(): String =
                "ChecksumMismatch(" +
                        "actualChecksum=${actualChecksum?.toHex()}, " +
                        "expectedChecksum=${expectedChecksum?.toHex()})"

            private companion object {
                private const val PREFIX_BYTES = 2

                private fun ByteArray.toHexPrefix() =
                    take(PREFIX_BYTES).joinToString("") { "%02x".format(it) } + "..."

                private fun ByteArray.toHex() =
                    joinToString("") { "%02x".format(it) }
            }
        }
    }
}
