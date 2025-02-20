using System.Net;
using System.Net.Http.Json;
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

            case HttpStatusCode.BadRequest or HttpStatusCode.TooManyRequests:
                {
                    var response = await responseMessage.Content.ReadFromJsonAsync(ProtonApiSerializerContext.Default.ApiResponse, cancellationToken)
                        .ConfigureAwait(false) ?? throw new JsonException();

                    throw new ProtonApiException(responseMessage.StatusCode, response);
                }

            default:
                responseMessage.EnsureSuccessStatusCode();
                break;
        }
    }
}
