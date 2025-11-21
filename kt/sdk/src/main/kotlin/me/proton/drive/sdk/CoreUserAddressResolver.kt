/*
 * Copyright (c) 2025 Proton AG.
 * This file is part of Proton Core.
 *
 * Proton Core is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Proton Core is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Proton Core.  If not, see <https://www.gnu.org/licenses/>.
 */

package me.proton.drive.sdk

import me.proton.core.crypto.common.context.CryptoContext
import me.proton.core.domain.entity.UserId
import me.proton.core.key.domain.extension.primary
import me.proton.core.key.domain.useKeys
import me.proton.core.user.domain.entity.AddressId
import me.proton.core.user.domain.entity.UserAddress
import me.proton.core.user.domain.extension.canEncrypt
import me.proton.core.user.domain.extension.canVerify
import me.proton.core.user.domain.extension.primary
import me.proton.core.user.domain.repository.UserAddressRepository
import me.proton.drive.sdk.entity.Address

class CoreUserAddressResolver(
    private val userId: UserId,
    private val cryptoContext: CryptoContext,
    private val userAddressRepository: UserAddressRepository,
) : UserAddressResolver {
    override suspend fun getAddress(id: String): Address =
        checkNotNull(userAddressRepository.getAddress(userId, AddressId(id))) {
            "Cannot found address: $id"
        }.toSdkAddress()

    override suspend fun getDefaultAddress(): Address =
        checkNotNull(userAddressRepository.getAddresses(userId).primary()) {
            "Cannot found default address"
        }.toSdkAddress()

    override suspend fun <T> getAddressPrimaryPrivateKey(id: String, block: (ByteArray) -> T): T =
        checkNotNull(userAddressRepository.getAddress(userId, AddressId(id))) {
            "Cannot found address: $id"
        }.useKeys(cryptoContext) {
            block(privateKeyRing.unlockedPrimaryKey.unlockedKey.value)
        }

    override suspend fun <T> getAddressPrivateKeys(id: String, block: (List<ByteArray>) -> T): T =
        checkNotNull(userAddressRepository.getAddress(userId, AddressId(id))) {
            "Cannot found address: $id"
        }.useKeys(cryptoContext) {
            block(privateKeyRing.unlockedKeys.map { key -> key.unlockedKey.value })
        }

    private fun UserAddress.toSdkAddress() = Address(
        addressId = addressId.id,
        order = order,
        emailAddress = email,
        status = when {
            enabled -> Address.Status.ENABLED
            else -> Address.Status.DISABLED
        },
        keys = keys.map { key ->
            Address.Key(
                addressId = key.addressId.id,
                keyId = key.keyId.id,
                active = key.active,
                allowedForEncryption = key.canEncrypt(),
                allowedForVerification = key.canVerify(),
            )
        },
        primaryKeyIndex = keys.indexOf(keys.primary())
    )
}
