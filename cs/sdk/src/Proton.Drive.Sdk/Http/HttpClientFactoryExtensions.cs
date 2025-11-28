namespace Proton.Drive.Sdk.Http;

internal static class HttpClientFactoryExtensions
{
    public static HttpClient CreateClientWithTimeout(this IHttpClientFactory httpClientFactory, int timeoutSeconds)
    {
        var client = httpClientFactory.CreateClient();

        client.Timeout = TimeSpan.FromSeconds(timeoutSeconds);

        return client;
    }
}
