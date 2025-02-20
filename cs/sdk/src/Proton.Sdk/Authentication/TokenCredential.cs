using Microsoft.Extensions.Logging;
using Proton.Sdk.Api;
using Proton.Sdk.Authentication.Api;

namespace Proton.Sdk.Authentication;

public sealed class TokenCredential
{
    private readonly IAuthenticationApiClient _client;
    private readonly SessionId _sessionId;
    private readonly ILogger<TokenCredential> _logger;

    private Lazy<Task<(string AccessToken, string RefreshToken)>> _tokensTask;

    internal TokenCredential(IAuthenticationApiClient client, SessionId sessionId, string accessToken, string refreshToken, ILogger<TokenCredential> logger)
    {
        _client = client;
        _sessionId = sessionId;
        _logger = logger;

        _tokensTask = new Lazy<Task<(string AccessToken, string RefreshToken)>>(Task.FromResult((accessToken, refreshToken)));
    }

    public event Action? TokensRefreshed;
    public event Action? RefreshTokenExpired;

    public Task<(string AccessToken, string RefreshToken)> GetTokensAsync(CancellationToken cancellationToken)
    {
        return _tokensTask.Value.WaitAsync(cancellationToken);
    }

    public async Task<string> GetAccessTokenAsync(CancellationToken cancellationToken)
    {
        var (accessToken, _) = await _tokensTask.Value.WaitAsync(cancellationToken).ConfigureAwait(false);
        return accessToken;
    }

    public async Task<string> GetRefreshedAccessTokenAsync(string rejectedAccessToken, CancellationToken cancellationToken)
    {
        var currentTokensTask = _tokensTask;

        var (currentAccessToken, currentRefreshToken) = await currentTokensTask.Value.WaitAsync(cancellationToken).ConfigureAwait(false);

        var isLikelyAlreadyRefreshedToken = currentAccessToken != rejectedAccessToken;
        if (isLikelyAlreadyRefreshedToken)
        {
            return currentAccessToken;
        }

        var refreshedTokensTask = new Lazy<Task<(string AccessToken, string RefreshToken)>>(
            async () =>
            {
                try
                {
                    _logger.Log(LogLevel.Debug, "Refreshing token for {SessionId}", _sessionId);
                    var response = await _client.RefreshSessionAsync(_sessionId, currentAccessToken, currentRefreshToken, cancellationToken)
                        .ConfigureAwait(false);

                    return (response.AccessToken, response.RefreshToken);
                }
                catch (ProtonApiException ex) when (ex.Code == ResponseCode.InvalidRefreshToken)
                {
                    throw;
                }
                catch
                {
                    // Return expired access token to allow refreshing again later
                    return (currentAccessToken, currentRefreshToken);
                }
            });

        var tokensTaskReplaced = Interlocked.CompareExchange(ref _tokensTask, refreshedTokensTask, currentTokensTask) == currentTokensTask;

        try
        {
            var result = await GetAccessTokenAsync(cancellationToken).ConfigureAwait(false);

            if (tokensTaskReplaced)
            {
                OnTokensRefreshed();
            }

            return result;
        }
        catch (ProtonApiException ex) when (ex.Code == ResponseCode.InvalidRefreshToken)
        {
            if (tokensTaskReplaced)
            {
                OnRefreshTokenExpired();
            }

            throw;
        }
    }

    private void OnTokensRefreshed()
    {
        TokensRefreshed?.Invoke();
    }

    private void OnRefreshTokenExpired()
    {
        RefreshTokenExpired?.Invoke();
    }
}
