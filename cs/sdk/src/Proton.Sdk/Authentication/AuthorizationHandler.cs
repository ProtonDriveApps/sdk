using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Proton.Sdk.Api;
using Proton.Sdk.Serialization;

namespace Proton.Sdk.Authentication;

internal sealed class AuthorizationHandler(ProtonApiSession session) : DelegatingHandler
{
    private const string SessionIdHeaderName = "x-pm-uid";

    private readonly ProtonApiSession _session = session;

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        request.Headers.Add(SessionIdHeaderName, _session.SessionId.ToString());

        var accessToken = await _session.TokenCredential.GetAccessTokenAsync(cancellationToken).ConfigureAwait(false);

        var response = await SendWithTokenAsync(request, accessToken, cancellationToken).ConfigureAwait(false);

        if (response.StatusCode == HttpStatusCode.Unauthorized)
        {
            response = await HandleUnauthorizedAsync(request, response, accessToken, cancellationToken).ConfigureAwait(false);
        }

        return response;
    }

    private async Task<HttpResponseMessage> HandleUnauthorizedAsync(
        HttpRequestMessage request,
        HttpResponseMessage response,
        string rejectedAccessToken,
        CancellationToken cancellationToken)
    {
        var apiResponse = await response.Content.ReadFromJsonAsync(ProtonApiSerializerContext.Default.ApiResponse, cancellationToken).ConfigureAwait(false);

        if (apiResponse?.Code is ResponseCode.AccountDeleted or ResponseCode.AccountDisabled)
        {
            return response;
        }

        var accessToken = await _session.TokenCredential.GetRefreshedAccessTokenAsync(rejectedAccessToken, cancellationToken).ConfigureAwait(false);

        return await SendWithTokenAsync(request, accessToken, cancellationToken).ConfigureAwait(false);
    }

    private Task<HttpResponseMessage> SendWithTokenAsync(HttpRequestMessage request, string accessToken, CancellationToken cancellationToken)
    {
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        return base.SendAsync(request, cancellationToken);
    }
}
