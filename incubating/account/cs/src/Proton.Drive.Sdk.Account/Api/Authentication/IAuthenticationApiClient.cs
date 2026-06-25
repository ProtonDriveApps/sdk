using Proton.Cryptography.Srp;
using Proton.Drive.Sdk.Account.Authentication;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Account.Api.Authentication;

internal interface IAuthenticationApiClient
{
    Task<SessionInitiationResponse> InitiateSessionAsync(string username, CancellationToken cancellationToken);

    Task<AuthenticationResponse> AuthenticateAsync(
        SessionInitiationResponse initiationResponse,
        SrpClientHandshake srpClientHandshake,
        string username,
        CancellationToken cancellationToken);

    Task<ScopesResponse> ValidateSecondFactorAsync(string secondFactorCode, CancellationToken cancellationToken);

    Task<ApiResponse> EndSessionAsync();

    Task<ApiResponse> EndSessionAsync(string sessionId, string accessToken);

    Task<SessionRefreshResponse> RefreshSessionAsync(
        SessionId sessionId,
        string accessToken,
        string refreshToken,
        CancellationToken cancellationToken);

    Task<ScopesResponse> GetScopesAsync(CancellationToken cancellationToken);

    Task<ModulusResponse> GetRandomSrpModulusAsync(CancellationToken cancellationToken);
}
