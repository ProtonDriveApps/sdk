using System.Net;
using System.Net.Http.Json;
using System.Runtime.Serialization;
using System.Text.Json;
using System.Text.Json.Serialization.Metadata;

namespace Proton.Sdk.Api.Http;

public static class HttpResponseMessageExtensions
{
    public static async Task EnsureApiSuccessAsync<TFailure>(
        this HttpResponseMessage responseMessage,
        JsonTypeInfo<TFailure> failureTypeInfo,
        CancellationToken cancellationToken)
        where TFailure : ApiResponse
    {
        switch (responseMessage.StatusCode)
        {
            case HttpStatusCode.UnprocessableEntity or HttpStatusCode.Conflict:
                {
                    EnsureNonEmptyContent(responseMessage);
                    var response = await responseMessage.Content.ReadFromJsonAsync(failureTypeInfo, cancellationToken)
                        .ConfigureAwait(false) ?? throw new JsonException();

                    throw new ProtonApiException<TFailure>(responseMessage.StatusCode, response);
                }

            case HttpStatusCode.BadRequest:
                {
                    var response = await ReadApiResponseAsync(responseMessage, cancellationToken).ConfigureAwait(false);
                    throw new ProtonApiException(responseMessage.StatusCode, response);
                }

            case HttpStatusCode.TooManyRequests:
                {
                    var response = await ReadApiResponseAsync(responseMessage, cancellationToken).ConfigureAwait(false);
                    throw new TooManyRequestsException(responseMessage.StatusCode, response, GetRetryAfter(responseMessage));
                }

            default:
                responseMessage.EnsureSuccessStatusCode();
                break;
        }
    }

    private static async Task<ApiResponse> ReadApiResponseAsync(HttpResponseMessage responseMessage, CancellationToken cancellationToken)
    {
        EnsureNonEmptyContent(responseMessage);
        return await responseMessage.Content.ReadFromJsonAsync(ApiSerializerContext.Default.ApiResponse, cancellationToken)
            .ConfigureAwait(false) ?? throw new JsonException();
    }

    private static void EnsureNonEmptyContent(HttpResponseMessage responseMessage)
    {
        if (responseMessage.Content.Headers.ContentLength is 0)
        {
            throw new ProtonApiException(responseMessage.ReasonPhrase, (int)responseMessage.StatusCode, ApiResponseCodes.Unknown);
        }
    }

    private static DateTime? GetRetryAfter(HttpResponseMessage responseMessage)
    {
        var retryAfter = responseMessage.Headers.RetryAfter;
        if (retryAfter == null)
        {
            return null;
        }

        if (retryAfter.Delta is { } offset)
        {
            return DateTime.UtcNow.Add(offset);
        }

        if (retryAfter.Date is { } date)
        {
            return date.UtcDateTime;
        }

        throw new SerializationException("Invalid Retry-After header");
    }
}
