using System.Net;
using Proton.Sdk.Api;

namespace Proton.Sdk;

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

    public ProtonApiException(string? message, int? transportCode, ResponseCode code)
        : this(message)
    {
        Code = code;
        TransportCode = transportCode;
    }

    internal ProtonApiException(HttpStatusCode statusCode, ApiResponse response)
        : this(response.ErrorMessage, (int)statusCode, response.Code)
    {
    }

    internal ProtonApiException(ApiResponse response)
        : this(response.ErrorMessage, null, response.Code)
    {
    }

    public ResponseCode Code { get; }
    public int? TransportCode { get; }
}
