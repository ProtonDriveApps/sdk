package me.proton.drive.sdk

import me.proton.core.domain.entity.UserId
import me.proton.core.key.domain.extension.publicKeyRing
import me.proton.core.key.domain.repository.PublicAddressRepository

class CorePublicAddressResolver(
    private val userId: UserId,
    private val publicAddressRepository: PublicAddressRepository,
) : PublicAddressResolver {

    override suspend fun getAddressPublicKeys(emailAddress: String): List<ByteArray> {
        val publicAddressInfo = publicAddressRepository.getPublicAddressInfo(
            sessionUserId = userId,
            email = emailAddress
        )
        val publicAddressKeys = publicAddressInfo.address.keys + publicAddressInfo.unverified?.keys.orEmpty()
        return publicAddressKeys.publicKeyRing().keys.map { publicKey ->
            publicKey.key.toByteArray()
        }
    }

}
