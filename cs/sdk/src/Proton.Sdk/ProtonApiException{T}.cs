using System.Net;
using Proton.Sdk.Api;

namespace Proton.Sdk;

internal sealed class ProtonApiException<T> : ProtonApiException
    where T : ApiResponse
{
    public ProtonApiException()
    {
    }

    public ProtonApiException(string message)
        : base(message)
    {
    }

    public ProtonApiException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    public ProtonApiException(HttpStatusCode statusCode, T response)
        : base(statusCode, response)
    {
        Response = response;
    }

    public T? Response { get; }
}
