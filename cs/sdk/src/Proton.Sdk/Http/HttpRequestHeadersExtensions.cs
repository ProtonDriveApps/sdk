using System.Net.Http.Headers;

namespace Proton.Sdk.Http;

internal static class HttpRequestHeadersExtensions
{
    private const string ContentType = "application/vnd.protonmail.api+json";

    public static void AddApiRequestHeaders(this HttpRequestHeaders headerCollection)
    {
        // TODO: Add Accept-Language header
        headerCollection.Accept.Add(new MediaTypeWithQualityHeaderValue(ContentType));
    }
}
