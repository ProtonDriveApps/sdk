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
