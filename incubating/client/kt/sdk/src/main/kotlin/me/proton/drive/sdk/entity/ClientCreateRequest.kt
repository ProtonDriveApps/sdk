package me.proton.drive.sdk.entity

import me.proton.drive.sdk.LoggerProvider

data class ClientCreateRequest(
    val baseUrl: String,
    val loggerProvider: LoggerProvider,
    val cachePath: String? = null,
    val bindingsLanguage: String? = null,
    val uid: String? = null,
    val apiCallTimeout: Int? = null,
    val storageCallTimeout: Int? = null,
    val blockTransferParallelism: Int? = null,
    val cacheEncryptionKey: ByteArray? = null,
    val searchIndexPath: String? = null,
)
