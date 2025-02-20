using Proton.Cryptography.Srp;
using Proton.Sdk.Api;
using Proton.Sdk.Http;
using Proton.Sdk.Serialization;

namespace Proton.Sdk.Authentication.Api;

internal sealed class AuthenticationApiClient(HttpClient httpClient, Uri refreshRedirectUri) : IAuthenticationApiClient
{
    private readonly Uri _refreshRedirectUri = refreshRedirectUri;

    private readonly HttpClient _httpClient = httpClient;

    public async Task<SessionInitiationResponse> InitiateSessionAsync(string username, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(ProtonApiSerializerContext.Default.SessionInitiationResponse)
            .PostAsync(
                "auth/v4/info",
                new SessionInitiationRequest(username),
                ProtonApiSerializerContext.Default.SessionInitiationRequest,
                cancellationToken).ConfigureAwait(false);
    }

    public async Task<AuthenticationResponse> AuthenticateAsync(
        SessionInitiationResponse initiationResponse,
        SrpClientHandshake srpClientHandshake,
        string username,
        CancellationToken cancellationToken)
    {
        var request = new AuthenticationRequest
        {
            ClientEphemeral = srpClientHandshake.Ephemeral,
            ClientProof = srpClientHandshake.Proof,
            SrpSessionId = initiationResponse.SrpSessionId,
            Username = username,
        };

        return await _httpClient
            .Expecting(ProtonApiSerializerContext.Default.AuthenticationResponse)
            .PostAsync("auth/v4", request, ProtonApiSerializerContext.Default.AuthenticationRequest, cancellationToken).ConfigureAwait(false);
    }

    public async Task<ScopesResponse> ValidateSecondFactorAsync(string secondFactorCode, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(ProtonApiSerializerContext.Default.ScopesResponse)
            .PostAsync(
                "auth/v4/2fa",
                new SecondFactorValidationRequest(secondFactorCode),
                ProtonApiSerializerContext.Default.SecondFactorValidationRequest,
                cancellationToken)
            .ConfigureAwait(false);
    }

    public async Task<ApiResponse> EndSessionAsync()
    {
        return await _httpClient
            .Expecting(ProtonApiSerializerContext.Default.ApiResponse)
            .DeleteAsync("auth/v4", CancellationToken.None).ConfigureAwait(false);
    }

    public async Task<ApiResponse> EndSessionAsync(string sessionId, string accessToken)
    {
        return await _httpClient
            .Expecting(ProtonApiSerializerContext.Default.ApiResponse)
            .DeleteAsync("auth/v4", sessionId, accessToken, CancellationToken.None).ConfigureAwait(false);
    }

    public async Task<SessionRefreshResponse> RefreshSessionAsync(
        SessionId sessionId,
        string accessToken,
        string refreshToken,
        CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(ProtonApiSerializerContext.Default.SessionRefreshResponse)
            .PostAsync(
                "auth/v4/refresh",
                sessionId,
                accessToken,
                new SessionRefreshRequest(refreshToken, "token", "refresh_token", _refreshRedirectUri),
                ProtonApiSerializerContext.Default.SessionRefreshRequest,
                cancellationToken).ConfigureAwait(false);
    }

    public async Task<ScopesResponse> GetScopesAsync(CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(ProtonApiSerializerContext.Default.ScopesResponse)
            .GetAsync("auth/v4/scopes", cancellationToken).ConfigureAwait(false);
    }

    public async Task<ModulusResponse> GetRandomSrpModulusAsync(CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(ProtonApiSerializerContext.Default.ModulusResponse)
            .GetAsync("auth/v4/modulus", cancellationToken).ConfigureAwait(false);
    }
}
