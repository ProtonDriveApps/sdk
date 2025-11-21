/*
 * Copyright (c) 2025 Proton AG.
 * This file is part of Proton Drive.
 *
 * Proton Drive is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Proton Drive is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Proton Drive.  If not, see <https://www.gnu.org/licenses/>.
 */

package me.proton.drive.sdk.internal

import com.google.protobuf.kotlin.toByteString
import me.proton.core.domain.entity.UserId
import me.proton.core.network.data.ApiProvider
import me.proton.core.network.data.ProtonErrorException
import me.proton.core.network.domain.ApiResult
import me.proton.drive.sdk.HttpSdkApi
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.ResponseBody
import proton.sdk.ProtonSdk.HttpRequest
import proton.sdk.ProtonSdk.HttpResponse
import proton.sdk.httpHeader
import proton.sdk.httpResponse
import retrofit2.Response

internal class ApiProviderBridge(
    private val userId: UserId,
    private val apiProvider: ApiProvider
) : suspend (HttpRequest) -> HttpResponse {
    override suspend fun invoke(request: HttpRequest): HttpResponse {
        val apiResult = apiProvider.get<HttpSdkApi>(userId).invoke {
            execute(
                method = request.method,
                url = request.url,
                headers = request.headersList.associate { header ->
                    header.name to header.valuesList.joinToString(",")
                },
                body = request.content.toByteArray().toRequestBody()
            )
        }

        if (apiResult is ApiResult.Error) {
            val error = apiResult.cause
            if (error is ProtonErrorException) {
                val response = error.response
                return httpResponse {
                    statusCode = response.code
                    val responseHeaders = response.headers
                    responseHeaders.names().forEach { name ->
                        headers += httpHeader {
                            this@httpHeader.name = name
                            values.addAll(responseHeaders.values(name))
                        }
                    }
                    response.body?.byteString()?.toByteArray()?.toByteString()?.let { body ->
                        content = body
                    }
                }
            }
        }

        val response = apiResult.valueOrThrow

        return httpResponse {
            statusCode = response.code()
            val responseHeaders = response.headers()
            responseHeaders.names().forEach { name ->
                headers += httpHeader {
                    this@httpHeader.name = name
                    values.addAll(responseHeaders.values(name))
                }
            }
            response.body()?.byteString()?.toByteArray()?.toByteString()?.let { body ->
                content = body
            }
        }
    }

    private suspend fun HttpSdkApi.execute(
        method: String,
        url: String,
        headers: Map<String, String> = emptyMap(),
        body: RequestBody? = null
    ): Response<ResponseBody> {
        return when (method.uppercase()) {
            "GET" -> get(url, headers)
            "POST" -> post(url, headers, body)
            "PUT" -> put(url, headers, body)
            "DELETE" -> delete(url, headers, body)
            else -> throw IllegalArgumentException("Unsupported method: $method")
        }
    }
}
