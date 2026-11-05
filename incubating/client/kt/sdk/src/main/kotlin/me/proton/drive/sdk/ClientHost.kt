package me.proton.drive.sdk

/** What the host supplies to create a client. Every part is required; the user id must not be blank. */
class ClientHost(
    val userId: String,
    val httpClient: SdkHttpClient,
    val userAddressResolver: UserAddressResolver,
    val publicAddressResolver: PublicAddressResolver
) {
    init {
        require(userId.isNotBlank()) { "The user id must not be blank" }
    }

    // Leaves out the user id, so that a log line never carries it.
    override fun toString(): String = "ClientHost(userId=<hidden>)"
}
