using System.Text.Json.Serialization.Metadata;
using Proton.Sdk.Api;
using Proton.Sdk.Serialization;

namespace Proton.Sdk.Http;

internal static class HttpClientExtensions
{
    public static HttpApiCallBuilder<TSuccess, ApiResponse> Expecting<TSuccess>(this HttpClient httpClient, JsonTypeInfo<TSuccess> successTypeInfo)
    {
        return new HttpApiCallBuilder<TSuccess, ApiResponse>(httpClient, successTypeInfo, ProtonApiSerializerContext.Default.ApiResponse);
    }

    public static HttpApiCallBuilder<TSuccess, TFailure> Expecting<TSuccess, TFailure>(
        this HttpClient httpClient,
        JsonTypeInfo<TSuccess> successTypeInfo,
        JsonTypeInfo<TFailure> failureTypeInfo)
        where TFailure : ApiResponse
    {
        return new HttpApiCallBuilder<TSuccess, TFailure>(httpClient, successTypeInfo, failureTypeInfo);
    }
}
