package me.proton.drive.sdk

interface PublicAddressResolver {

    suspend fun getAddressPublicKeys(emailAddress: String): List<ByteArray>
}
