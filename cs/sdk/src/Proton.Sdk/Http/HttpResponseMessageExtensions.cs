using System.Net;
using System.Net.Http.Json;
using System.Runtime.Serialization;
using System.Text.Json;
using System.Text.Json.Serialization.Metadata;
using Proton.Sdk.Api;
using Proton.Sdk.Serialization;

namespace Proton.Sdk.Http;

internal static class HttpResponseMessageExtensions
{
    // TODO: add unit test
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
                    var response = await responseMessage.Content.ReadFromJsonAsync(failureTypeInfo, cancellationToken)
                        .ConfigureAwait(false) ?? throw new JsonException();

                    throw new ProtonApiException<TFailure>(responseMessage.StatusCode, response);
                }

            case HttpStatusCode.BadRequest:
                {
                    var response = await responseMessage.Content.ReadFromJsonAsync(ProtonApiSerializerContext.Default.ApiResponse, cancellationToken)
                        .ConfigureAwait(false) ?? throw new JsonException();

                    throw new ProtonApiException(responseMessage.StatusCode, response);
                }

            case HttpStatusCode.TooManyRequests:
                {
                    var response = await responseMessage.Content.ReadFromJsonAsync(ProtonApiSerializerContext.Default.ApiResponse, cancellationToken)
                        .ConfigureAwait(false) ?? throw new JsonException();

                    throw new TooManyRequestsException(responseMessage.StatusCode, response, GetRetryAfter(responseMessage));
                }

            default:
                responseMessage.EnsureSuccessStatusCode();
                break;
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
