using Microsoft.Extensions.Logging;
using Proton.Cryptography.Srp;
using Proton.Sdk.Api;
using Proton.Sdk.Api.Authentication;
using Proton.Sdk.Api.Keys;
using Proton.Sdk.Authentication;
using Proton.Sdk.Caching;
using Proton.Sdk.Telemetry;
using Proton.Sdk.Users;

namespace Proton.Sdk;

public sealed class ProtonApiSession
{
    private readonly HttpClient _httpClient;

    private bool _isEnded;
    private Action? _ended;
    private IAuthenticationApiClient? _authenticationApi;
    private IKeysApiClient? _keysApi;

    internal ProtonApiSession(
        SessionId sessionId,
        string username,
        UserId userId,
        TokenCredential tokenCredential,
        IEnumerable<string> scopes,
        bool isWaitingForSecondFactorCode,
        PasswordMode passwordMode,
        ProtonClientConfiguration clientConfiguration)
    {
        _httpClient = clientConfiguration.GetHttpClient(this);

        Username = username;
        UserId = userId;
        SessionId = sessionId;
        TokenCredential = tokenCredential;
        Scopes = scopes.ToArray().AsReadOnly();
        IsWaitingForSecondFactorCode = isWaitingForSecondFactorCode;
        PasswordMode = passwordMode;
        ClientConfiguration = clientConfiguration;
        SecretCache = new SessionSecretCache(clientConfiguration.SecretCacheRepository);
    }

    public event Action? Ended
    {
        add
        {
            _ended += value;
            TokenCredential.RefreshTokenExpired -= OnRefreshTokenExpired;
            TokenCredential.RefreshTokenExpired += OnRefreshTokenExpired;
        }
        remove
        {
            _ended -= value;
            TokenCredential.RefreshTokenExpired -= OnRefreshTokenExpired;
        }
    }

    public SessionId SessionId { get; }

    public string Username { get; }

    public UserId UserId { get; }

    public TokenCredential TokenCredential { get; }

    public IReadOnlyList<string> Scopes { get; private set; }

    public bool IsWaitingForSecondFactorCode { get; private set; }

    public PasswordMode PasswordMode { get; }

    internal ProtonClientConfiguration ClientConfiguration { get; }

    internal SessionSecretCache SecretCache { get; }

    private IAuthenticationApiClient AuthenticationApi
        => _authenticationApi ??= ApiClientFactory.Instance.CreateAuthenticationApiClient(_httpClient, ClientConfiguration.RefreshRedirectUri);

    private IKeysApiClient KeysApi => _keysApi ??= ApiClientFactory.Instance.CreateKeysApiClient(_httpClient);

    public static ValueTask<ProtonApiSession> BeginAsync(string username, ReadOnlyMemory<byte> password, string appVersion, CancellationToken cancellationToken)
    {
        return BeginAsync(username, password, appVersion, new ProtonSessionOptions(), cancellationToken);
    }

    public static async ValueTask<ProtonApiSession> BeginAsync(
        string username,
        ReadOnlyMemory<byte> password,
        string appVersion,
        ProtonSessionOptions options,
        CancellationToken cancellationToken)
    {
        var configuration = new ProtonClientConfiguration(appVersion, options);
        var logger = configuration.Telemetry.GetLogger<ProtonApiSession>();

        var authApiClient = ApiClientFactory.Instance.CreateAuthenticationApiClient(configuration.GetHttpClient(), configuration.RefreshRedirectUri);

        var sessionInitResponse = await authApiClient.InitiateSessionAsync(username, cancellationToken).ConfigureAwait(false);

        logger.LogDebug("SRP session {SessionId} initiated", sessionInitResponse.SrpSessionId);

        var srpClient = SrpClient.Create(
            username,
            password.Span,
            sessionInitResponse.Salt.Span,
            sessionInitResponse.Modulus,
            SrpClient.GetDefaultModulusVerificationKey());

        var srpClientHandshake = srpClient.ComputeHandshake(sessionInitResponse.ServerEphemeral.Span, 2048);

        var authResponse = await authApiClient.AuthenticateAsync(sessionInitResponse, srpClientHandshake, username, cancellationToken)
            .ConfigureAwait(false);

        logger.LogDebug("API session {SessionId} authenticated with password", authResponse.SessionId);

        var tokenCredential = new TokenCredential(
            authApiClient,
            authResponse.SessionId,
            authResponse.AccessToken,
            authResponse.RefreshToken,
            configuration.Telemetry.GetLogger<TokenCredential>());

        var session = new ProtonApiSession(
            authResponse.SessionId,
            username,
            authResponse.UserId,
            tokenCredential,
            authResponse.Scopes,
            authResponse.SecondFactorParameters?.IsEnabled == true,
            authResponse.PasswordMode,
            configuration);

        if (session is { IsWaitingForSecondFactorCode: false, PasswordMode: PasswordMode.Single })
        {
            try
            {
                await session.ApplyDataPasswordAsync(password, cancellationToken).ConfigureAwait(false);
            }
            catch
            {
                // Ignore
                // FIXME: log that
            }
        }

        return session;
    }

    public static ProtonApiSession Resume(
        SessionId sessionId,
        string username,
        UserId userId,
        string accessToken,
        string refreshToken,
        IEnumerable<string> scopes,
        bool isWaitingForSecondFactorCode,
        PasswordMode passwordMode,
        string appVersion,
        ICacheRepository secretCacheRepository)
    {
        return Resume(
            sessionId,
            username,
            userId,
            accessToken,
            refreshToken,
            scopes,
            isWaitingForSecondFactorCode,
            passwordMode,
            appVersion,
            secretCacheRepository,
            new ProtonClientOptions());
    }

    public static ProtonApiSession Resume(
        SessionId sessionId,
        string username,
        UserId userId,
        string accessToken,
        string refreshToken,
        IEnumerable<string> scopes,
        bool isWaitingForSecondFactorCode,
        PasswordMode passwordMode,
        string appVersion,
        ICacheRepository secretCacheRepository,
        ProtonClientOptions options)
    {
        options = options with { SecretCacheRepository = secretCacheRepository };

        var configuration = new ProtonClientConfiguration(appVersion, options);

        var logger = configuration.Telemetry.GetLogger<ProtonApiSession>();

        var tokenCredential = new TokenCredential(
            ApiClientFactory.Instance.CreateAuthenticationApiClient(configuration.GetHttpClient(), configuration.RefreshRedirectUri),
            sessionId,
            accessToken,
            refreshToken,
            configuration.Telemetry.GetLogger<TokenCredential>());

        var session = new ProtonApiSession(
            sessionId,
            username,
            userId,
            tokenCredential,
            scopes,
            isWaitingForSecondFactorCode,
            passwordMode,
            configuration);

        logger.LogDebug("Session {SessionId} was resumed", session.SessionId);

        return session;
    }

    public static ProtonApiSession Renew(
        ProtonApiSession expiredSession,
        SessionId sessionId,
        string accessToken,
        string refreshToken,
        IEnumerable<string> scopes,
        bool isWaitingForSecondFactorCode,
        PasswordMode passwordMode)
    {
        var tokenCredential = new TokenCredential(
            new AuthenticationApiClient(expiredSession.ClientConfiguration.GetHttpClient(), expiredSession.ClientConfiguration.RefreshRedirectUri),
            sessionId,
            accessToken,
            refreshToken,
            expiredSession.ClientConfiguration.Telemetry.GetLogger<TokenCredential>());

        return new ProtonApiSession(
            sessionId,
            expiredSession.Username,
            expiredSession.UserId,
            tokenCredential,
            scopes,
            isWaitingForSecondFactorCode,
            passwordMode,
            expiredSession.ClientConfiguration);
    }

    public static async Task EndAsync(string id, string accessToken, string appVersion, ProtonClientOptions? options = null)
    {
        var configuration = new ProtonClientConfiguration(appVersion, options);

        var authApiClient = ApiClientFactory.Instance.CreateAuthenticationApiClient(configuration.GetHttpClient(), configuration.RefreshRedirectUri);

        await authApiClient.EndSessionAsync(id, accessToken).ConfigureAwait(false);
    }

    public async Task ApplySecondFactorCodeAsync(string secondFactorCode, CancellationToken cancellationToken)
    {
        var response = await AuthenticationApi.ValidateSecondFactorAsync(secondFactorCode, cancellationToken).ConfigureAwait(false);

        IsWaitingForSecondFactorCode = false;
        Scopes = response.Scopes;
    }

    public async Task ApplyDataPasswordAsync(ReadOnlyMemory<byte> password, CancellationToken cancellationToken)
    {
        var response = await KeysApi.GetKeySaltsAsync(cancellationToken).ConfigureAwait(false);

        foreach (var keySalt in response.KeySalts)
        {
            if (keySalt.Value.IsEmpty)
            {
                continue;
            }

            var passphrase = DeriveSecretFromPassword(password.Span, keySalt.Value.Span);

            await SecretCache.SetAccountKeyPassphraseAsync(keySalt.KeyId, passphrase, cancellationToken).ConfigureAwait(false);
        }
    }

    public async Task RefreshScopesAsync(CancellationToken cancellationToken)
    {
        var scopesResponse = await AuthenticationApi.GetScopesAsync(cancellationToken).ConfigureAwait(false);

        Scopes = scopesResponse.Scopes;
    }

    public async Task<bool> EndAsync()
    {
        if (_isEnded)
        {
            return true;
        }

        var response = await AuthenticationApi.EndSessionAsync().ConfigureAwait(false);

        if (response.IsSuccess)
        {
            _isEnded = true;

            _ended?.Invoke();
        }

        return _isEnded;
    }

    internal HttpClient GetHttpClient(string? baseRoutePath = null, TimeSpan? attemptTimeout = null)
    {
        return baseRoutePath is null && attemptTimeout is null
            ? _httpClient
            : ClientConfiguration.GetHttpClient(this, baseRoutePath, attemptTimeout);
    }

    private static ReadOnlyMemory<byte> DeriveSecretFromPassword(ReadOnlySpan<byte> password, ReadOnlySpan<byte> salt)
    {
        var hashDigest = SrpClient.HashPassword(password, salt).AsMemory();

        // Skip the first 29 characters which include the algorithm type, the number of rounds and the salt.
        return hashDigest[29..];
    }

    private void OnRefreshTokenExpired()
    {
        _isEnded = true;
        _ended?.Invoke();
    }
}
