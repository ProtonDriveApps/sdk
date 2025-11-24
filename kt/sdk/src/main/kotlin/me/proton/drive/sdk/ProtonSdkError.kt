package me.proton.drive.sdk

data class ProtonSdkError(
    val message: String,
    val type: String,
    val domain: ErrorDomain = ErrorDomain.Undefined,
    val primaryCode: Long? = null,
    val secondaryCode: Long? = null,
    val context: String? = null,
    val innerError: ProtonSdkError? = null,
    val additionalData: Data? = null,
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

    sealed interface Data {
        data class NodeNameConflict (
             val conflictingNodeIsFileDraft: Boolean,
             val conflictingNodeUid: String,
             val conflictingRevisionUid: String,
        ): Data
    }
}
