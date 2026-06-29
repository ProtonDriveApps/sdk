using System.Net;

namespace Proton.Sdk.Api;

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

    public TooManyRequestsException(HttpStatusCode statusCode, ApiResponse response, DateTime? retryAfter = null)
        : base(statusCode, response)
    {
        RetryAfter = retryAfter;
    }

    public DateTime? RetryAfter { get; }
}
