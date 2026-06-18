using System.Net;

namespace Proton.Sdk.Http;

internal static class StatusCodes
{
    /// <summary>
    /// Minimum HTTP status code that indicates a client error (400)
    /// </summary>
    public const int MinClientErrorCode = (int)HttpStatusCode.BadRequest;

    /// <summary>
    /// Maximum HTTP status code that indicates a client error (498)
    /// </summary>
    public const int MaxClientErrorCode = MinServerErrorCode - 1;

    /// <summary>
    /// Minimum HTTP status code that indicates a server error (499)
    /// </summary>
    /// <remarks>
    /// <para>
    /// HTTP status code 499 (ClientClosedRequest) is an unofficial status code originally defined by Nginx
    /// and is commonly used in logs when the client has disconnected.
    /// </para>
    /// <para>
    /// Ideally, this code should never be seen by client apps, it is supposed to be logged in server logs only.
    /// When the client app disconnects, it does not get the error from the server.
    /// If the client app occasionally gets 499, it can indicate something unexpected happening in communication
    /// between different servers, like load balancer, etc., where the "client" is another server, rather than the client app.
    /// </para>
    /// <para>In the client app, we consider this code a server error rather than a client error.</para>
    /// </remarks>
    public const int MinServerErrorCode = 499;

    /// <summary>
    /// Maximum HTTP status code that indicates a server error (599)
    /// </summary>
    public const int MaxServerErrorCode = 599;
}
