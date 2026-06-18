package me.proton.drive.sdk.internal

import com.google.protobuf.Any
import com.google.protobuf.bytesValue
import com.google.protobuf.kotlin.toByteString
import me.proton.drive.sdk.PublicAddressResolver
import me.proton.drive.sdk.UserAddressResolver
import me.proton.drive.sdk.extension.asAny
import me.proton.drive.sdk.extension.toProtobuf
import proton.drive.sdk.ProtonDriveSdk
import proton.sdk.repeatedBytesValue

internal class AccountClientBridge(
    private val userAddressResolver: UserAddressResolver,
    private val publicAddressResolver: PublicAddressResolver,
) : suspend (ProtonDriveSdk.AccountRequest) -> Any {
    override suspend fun invoke(
        request: ProtonDriveSdk.AccountRequest,
    ): Any = when (request.payloadCase) {
        ProtonDriveSdk.AccountRequest.PayloadCase.GET_ADDRESS -> userAddressResolver
            .getAddress(request.getAddress.addressId)
            .toProtobuf()
            .asAny("proton.sdk.Address")

        ProtonDriveSdk.AccountRequest.PayloadCase.GET_DEFAULT_ADDRESS -> userAddressResolver
            .getDefaultAddress()
            .toProtobuf()
            .asAny("proton.sdk.Address")

        ProtonDriveSdk.AccountRequest.PayloadCase.GET_ADDRESS_PRIMARY_PRIVATE_KEY -> userAddressResolver
            .getAddressPrimaryPrivateKey(request.getAddressPrimaryPrivateKey.addressId) { key ->
                bytesValue { value = key.toByteString() }
            }.asAny("google.protobuf.BytesValue")


        ProtonDriveSdk.AccountRequest.PayloadCase.GET_ADDRESS_PRIVATE_KEYS -> userAddressResolver
            .getAddressPrivateKeys(request.getAddressPrivateKeys.addressId) { keys ->
                repeatedBytesValue {
                    value.addAll(keys.map { key -> key.toByteString() })
                }.asAny("proton.sdk.RepeatedBytesValue")
            }

        ProtonDriveSdk.AccountRequest.PayloadCase.GET_ADDRESS_PUBLIC_KEYS -> repeatedBytesValue {
            value.addAll(
                publicAddressResolver
                    .getAddressPublicKeys(request.getAddressPublicKeys.emailAddress)
                    .map { key -> key.toByteString() }
            )
        }.asAny("proton.sdk.RepeatedBytesValue")

        ProtonDriveSdk.AccountRequest.PayloadCase.PAYLOAD_NOT_SET ->
            error("request not set (payload)")

        null ->
            error("request not set (null)")
    }
}
