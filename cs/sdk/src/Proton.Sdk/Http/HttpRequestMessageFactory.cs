using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization.Metadata;
using Proton.Sdk.Authentication;

namespace Proton.Sdk.Http;

internal static class HttpRequestMessageFactory
{
    public static HttpRequestMessage Create(HttpMethod method, string uri)
    {
        return new HttpRequestMessage(method, uri);
    }

    public static HttpRequestMessage Create(HttpMethod method, string uri, string accessToken)
    {
        var result = Create(method, uri);
        result.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return result;
    }

    public static HttpRequestMessage Create(HttpMethod method, string uri, string sessionId, string accessToken)
    {
        var result = Create(method, uri, accessToken);
        result.Headers.Add("x-pm-uid", sessionId);
        return result;
    }

    public static HttpRequestMessage Create<TBody>(HttpMethod method, string uri, TBody body, JsonTypeInfo<TBody> bodyTypeInfo)
    {
        var result = Create(method, uri);
        result.Content = JsonContent.Create(body, bodyTypeInfo);
        return result;
    }

    public static HttpRequestMessage Create<TBody>(HttpMethod method, string uri, string accessToken, TBody body, JsonTypeInfo<TBody> bodyTypeInfo)
    {
        var result = Create(method, uri, body, bodyTypeInfo);
        result.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return result;
    }

    public static HttpRequestMessage Create(HttpMethod method, string uri, HttpContent content)
    {
        var result = Create(method, uri);
        result.Content = content;
        return result;
    }

    public static HttpRequestMessage Create<TBody>(
        HttpMethod method,
        string uri,
        SessionId sessionId,
        string accessToken,
        TBody body,
        JsonTypeInfo<TBody> bodyTypeInfo)
    {
        var result = Create(method, uri, accessToken, body, bodyTypeInfo);
        result.Headers.Add("x-pm-uid", sessionId.ToString());
        return result;
    }
}
