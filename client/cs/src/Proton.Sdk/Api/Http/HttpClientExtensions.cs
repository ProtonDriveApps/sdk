using System.Text.Json.Serialization.Metadata;

namespace Proton.Sdk.Api.Http;

public static class HttpClientExtensions
{
    public static HttpApiCallBuilder<TSuccess, ApiResponse> Expecting<TSuccess>(this HttpClient httpClient, JsonTypeInfo<TSuccess> successTypeInfo)
    {
        return new HttpApiCallBuilder<TSuccess, ApiResponse>(httpClient, successTypeInfo, ApiSerializerContext.Default.ApiResponse);
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
