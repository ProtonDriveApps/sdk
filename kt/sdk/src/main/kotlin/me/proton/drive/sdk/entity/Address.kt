package me.proton.drive.sdk.entity

data class Address(
    val addressId: String,
    val order: Int,
    val emailAddress: String,
    val status: Status,
    val keys: List<Key>,
    val primaryKeyIndex: Int,
) {
    enum class Status {
        DISABLED, ENABLED, DELETING,
    }

    data class Key(
        val addressId: String,
        val keyId: String,
        val active: Boolean,
        val allowedForEncryption: Boolean,
        val allowedForVerification: Boolean,
    )
}
