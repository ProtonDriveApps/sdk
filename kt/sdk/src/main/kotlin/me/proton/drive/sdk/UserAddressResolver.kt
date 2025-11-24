package me.proton.drive.sdk

import me.proton.drive.sdk.entity.Address

interface UserAddressResolver {

    suspend fun getAddress(id: String): Address
    suspend fun getDefaultAddress(): Address
    suspend fun <T> getAddressPrimaryPrivateKey(id: String, block: (ByteArray) -> T): T
    suspend fun <T> getAddressPrivateKeys(id: String, block: (List<ByteArray>) -> T): T
}
