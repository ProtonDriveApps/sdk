package me.proton.drive.sdk

import me.proton.core.network.data.protonApi.BaseRetrofitApi
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.HTTP
import retrofit2.http.HeaderMap
import retrofit2.http.Url

interface HttpSdkApi : BaseRetrofitApi {
    @HTTP(method = "GET", path = "", hasBody = false)
    suspend fun get(
        @Url url: String,
        @HeaderMap headers: Map<String, String> = emptyMap()
    ): Response<ResponseBody>

    @HTTP(method = "POST", path = "", hasBody = true)
    suspend fun post(
        @Url url: String,
        @HeaderMap headers: Map<String, String> = emptyMap(),
        @Body body: RequestBody? = null
    ): Response<ResponseBody>

    @HTTP(method = "PUT", path = "", hasBody = true)
    suspend fun put(
        @Url url: String,
        @HeaderMap headers: Map<String, String> = emptyMap(),
        @Body body: RequestBody? = null
    ): Response<ResponseBody>

    @HTTP(method = "DELETE", path = "", hasBody = true)
    suspend fun delete(
        @Url url: String,
        @HeaderMap headers: Map<String, String> = emptyMap(),
        @Body body: RequestBody? = null
    ): Response<ResponseBody>
}
