using System.Net;

namespace Proton.Sdk.Api;

public class ProtonApiException : Exception
{
    public ProtonApiException()
    {
    }

    public ProtonApiException(string? message)
        : base(message)
    {
    }

    public ProtonApiException(string? message, Exception? innerException)
        : base(message, innerException)
    {
    }

    public ProtonApiException(string? message, int? transportCode, int code)
        : this(message)
    {
        Code = code;
        TransportCode = transportCode;
    }

    public ProtonApiException(HttpStatusCode statusCode, ApiResponse response)
        : this(response.ErrorMessage, (int)statusCode, response.Code)
    {
    }

    public ProtonApiException(ApiResponse response)
        : this(response.ErrorMessage, null, response.Code)
    {
    }

    public int? TransportCode { get; }

    public int Code { get; }
}
