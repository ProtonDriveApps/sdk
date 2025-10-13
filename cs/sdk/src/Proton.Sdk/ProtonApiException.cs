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

    internal ProtonApiException(HttpStatusCode statusCode, ApiResponse response)
        : this(response.ErrorMessage)
    {
        Code = response.Code;
        TransportCode = (int)statusCode;
    }

    internal ProtonApiException(ApiResponse response)
        : this(response.ErrorMessage)
    {
        Code = response.Code;
    }

    public ResponseCode Code { get; }
    public int? TransportCode { get; }
}
