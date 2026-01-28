using System.Net.Http.Json;
using System.Runtime.ExceptionServices;
using System.Text.Json;
using System.Text.Json.Serialization.Metadata;
using Proton.Sdk.Api;
using Proton.Sdk.Authentication;

namespace Proton.Sdk.Http;

// FIXME: add unit tests
internal readonly struct HttpApiCallBuilder<TSuccess, TFailure>
    where TFailure : ApiResponse
{
    private readonly HttpClient _httpClient;
    private readonly JsonTypeInfo<TSuccess> _successTypeInfo;
    private readonly JsonTypeInfo<TFailure> _failureTypeInfo;

    internal HttpApiCallBuilder(HttpClient httpClient, JsonTypeInfo<TSuccess> successTypeInfo, JsonTypeInfo<TFailure> failureTypeInfo)
    {
        _httpClient = httpClient;
        _successTypeInfo = successTypeInfo;
        _failureTypeInfo = failureTypeInfo;
    }

    public async ValueTask<TSuccess> GetAsync(string requestUri, CancellationToken cancellationToken)
    {
        using var requestMessage = HttpRequestMessageFactory.Create(HttpMethod.Get, requestUri);

        return await SendAsync(requestMessage, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<TSuccess> GetAsync(string requestUri, string sessionId, string accessToken, CancellationToken cancellationToken)
    {
        using var requestMessage = HttpRequestMessageFactory.Create(HttpMethod.Get, requestUri, sessionId, accessToken);
        return await SendAsync(requestMessage, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<TSuccess> PostAsync<TRequestBody>(
        string requestUri,
        TRequestBody body,
        JsonTypeInfo<TRequestBody> bodyTypeInfo,
        CancellationToken cancellationToken)
    {
        using var requestMessage = HttpRequestMessageFactory.Create(HttpMethod.Post, requestUri, body, bodyTypeInfo);

        return await SendAsync(requestMessage, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<TSuccess> PostAsync<TRequestBody>(
        string requestUri,
        SessionId sessionId,
        string accessToken,
        TRequestBody body,
        JsonTypeInfo<TRequestBody> bodyTypeInfo,
        CancellationToken cancellationToken)
    {
        using var requestMessage = HttpRequestMessageFactory.Create(HttpMethod.Post, requestUri, sessionId, accessToken, body, bodyTypeInfo);
        return await SendAsync(requestMessage, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<TSuccess> PutAsync<TRequestBody>(
        string requestUri,
        TRequestBody body,
        JsonTypeInfo<TRequestBody> bodyTypeInfo,
        CancellationToken cancellationToken)
    {
        using var requestMessage = HttpRequestMessageFactory.Create(HttpMethod.Put, requestUri, body, bodyTypeInfo);

        return await SendAsync(requestMessage, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<TSuccess> DeleteAsync(string requestUri, CancellationToken cancellationToken)
    {
        using var requestMessage = HttpRequestMessageFactory.Create(HttpMethod.Delete, requestUri);
        return await SendAsync(requestMessage, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<TSuccess> DeleteAsync(string requestUri, string sessionId, string accessToken, CancellationToken cancellationToken)
    {
        using var requestMessage = HttpRequestMessageFactory.Create(HttpMethod.Delete, requestUri, sessionId, accessToken);
        return await SendAsync(requestMessage, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<TSuccess> SendAsync(HttpRequestMessage requestMessage, CancellationToken cancellationToken)
    {
        try
        {
            var responseMessage = await _httpClient.SendAsync(requestMessage, cancellationToken).ConfigureAwait(false);

            await responseMessage.EnsureApiSuccessAsync(_failureTypeInfo, cancellationToken).ConfigureAwait(false);

            return await responseMessage.Content.ReadFromJsonAsync(_successTypeInfo, cancellationToken)
                .ConfigureAwait(false) ?? throw new JsonException();
        }
        catch (OperationCanceledException e) when (!cancellationToken.IsCancellationRequested)
        {
            throw new TimeoutException("The operation has timed out.", e);
        }
    }
}
