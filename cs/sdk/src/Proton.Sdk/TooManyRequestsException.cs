using System.Net;
using Proton.Sdk.Api;

namespace Proton.Sdk;

public class TooManyRequestsException : ProtonApiException
{
    public TooManyRequestsException()
    {
    }

    public TooManyRequestsException(string message)
        : base(message)
    {
    }

    public TooManyRequestsException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    internal TooManyRequestsException(HttpStatusCode statusCode, ApiResponse response, DateTime? retryAfter = null)
        : base(statusCode, response)
    {
        RetryAfter = retryAfter;
    }

    public DateTime? RetryAfter { get; }
}
