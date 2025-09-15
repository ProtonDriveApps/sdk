using System.Text;
using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Microsoft.Extensions.Logging;
using Proton.Sdk.Authentication;
using Proton.Sdk.Caching;
using Proton.Sdk.CExports.Logging;

namespace Proton.Sdk.CExports;

internal static class ProtonApiSessionRequestHandler
{
    public static async ValueTask<IMessage?> HandleBeginAsync(SessionBeginRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);

        ILoggerFactory? loggerFactory = null;

        if (request.Options.HasLoggerProviderHandle)
        {
            var loggerProvider = Interop.GetFromHandle<InteropLoggerProvider>(request.Options.LoggerProviderHandle);
            loggerFactory = new LoggerFactory([loggerProvider]);
        }

        var secretCacheRepository = request.HasSecretCachePath
            ? SqliteCacheRepository.OpenFile(request.SecretCachePath)
            : SqliteCacheRepository.OpenInMemory();

        var entityCacheRepository = request.Options.HasEntityCachePath
            ? SqliteCacheRepository.OpenFile(request.Options.EntityCachePath)
            : SqliteCacheRepository.OpenInMemory();

        var options = new ProtonSessionOptions
        {
            BaseUrl = new Uri(request.Options.BaseUrl),
            UserAgent = request.Options.UserAgent,
            BindingsLanguage = request.Options.BindingsLanguage,
            LoggerFactory = loggerFactory,
            TlsPolicy = (Proton.Sdk.Http.ProtonClientTlsPolicy?)request.Options.TlsPolicy,
            EntityCacheRepository = entityCacheRepository,
            SecretCacheRepository = secretCacheRepository,
        };

        var session = await ProtonApiSession.BeginAsync(
            request.Username,
            Encoding.UTF8.GetBytes(request.Password),
            request.AppVersion,
            options,
            cancellationToken).ConfigureAwait(false);

        return new Int64Value { Value = Interop.AllocHandle(session) };
    }

    public static IMessage HandleResume(SessionResumeRequest request)
    {
        ILoggerFactory? loggerFactory = null;

        if (request.Options.HasLoggerProviderHandle)
        {
            var loggerProvider = Interop.GetFromHandle<InteropLoggerProvider>(request.Options.LoggerProviderHandle);
            loggerFactory = new LoggerFactory([loggerProvider]);
        }

        var secretCacheRepository = SqliteCacheRepository.OpenFile(request.SecretCachePath);

        var entityCacheRepository = request.Options.HasEntityCachePath
            ? SqliteCacheRepository.OpenFile(request.Options.EntityCachePath)
            : SqliteCacheRepository.OpenInMemory();

        var options = new Proton.Sdk.ProtonClientOptions
        {
            BaseUrl = new Uri(request.Options.BaseUrl),
            UserAgent = request.Options.UserAgent,
            BindingsLanguage = request.Options.BindingsLanguage,
            LoggerFactory = loggerFactory,
            TlsPolicy = (Proton.Sdk.Http.ProtonClientTlsPolicy?)request.Options.TlsPolicy,
            EntityCacheRepository = entityCacheRepository,
            SecretCacheRepository = secretCacheRepository,
        };

        var passwordMode = request.IsWaitingForDataPassword ? PasswordMode.Dual : PasswordMode.Single;

        var session = ProtonApiSession.Resume(
            new SessionId(request.SessionId),
            request.Username,
            new Users.UserId(request.UserId),
            request.AccessToken,
            request.RefreshToken,
            request.Scopes,
            request.IsWaitingForSecondFactorCode,
            passwordMode,
            request.AppVersion,
            secretCacheRepository,
            options);

        return new Int64Value { Value = Interop.AllocHandle(session) };
    }

    public static IMessage HandleRenew(SessionRenewRequest request)
    {
        var expiredSession = Interop.GetFromHandle<ProtonApiSession>((nint)request.OldSessionHandle);

        var passwordMode = request.IsWaitingForDataPassword ? PasswordMode.Dual : PasswordMode.Single;

        var session = ProtonApiSession.Renew(
            expiredSession,
            new SessionId(request.SessionId),
            request.AccessToken,
            request.RefreshToken,
            request.Scopes,
            request.IsWaitingForSecondFactorCode,
            passwordMode);

        return new Int64Value { Value = Interop.AllocHandle(session) };
    }

    public static async ValueTask<IMessage?> HandleEndAsync(SessionEndRequest request)
    {
        var session = Interop.GetFromHandle<ProtonApiSession>((nint)request.SessionHandle);

        await session.EndAsync().ConfigureAwait(false);

        return null;
    }

    public static unsafe IMessage HandleSubscribeToTokensRefreshed(SessionTokensRefreshedSubscribeRequest request, nint callerState)
    {
        var session = Interop.GetFromHandle<ProtonApiSession>((nint)request.SessionHandle);

        var tokenRefreshedAction = new InteropAction<nint, InteropArray<byte>>(request.TokensRefreshedAction);

        var subscription = TokensRefreshedSubscription.Create(session, callerState, tokenRefreshedAction);

        return new Int64Value { Value = Interop.AllocHandle(subscription) };
    }

    public static IMessage? HandleUnsubscribeFromTokensRefreshed(SessionTokensRefreshedUnsubscribeRequest request)
    {
        var subscription = Interop.GetFromHandle<TokensRefreshedSubscription>((nint)request.SubscriptionHandle);

        subscription.Dispose();

        return null;
    }

    public static IMessage? HandleFree(SessionFreeRequest request)
    {
        Interop.FreeHandle<ProtonApiSession>(request.SessionHandle);

        return null;
    }

    private sealed class TokensRefreshedSubscription : IDisposable
    {
        private readonly ProtonApiSession _session;
        private readonly nint _callerState;
        private readonly InteropAction<nint, InteropArray<byte>> _tokensRefreshedAction;

        private TokensRefreshedSubscription(
            ProtonApiSession session,
            nint callerState,
            InteropAction<nint, InteropArray<byte>> tokensRefreshedAction)
        {
            _session = session;
            _callerState = callerState;
            _tokensRefreshedAction = tokensRefreshedAction;
        }

        public static TokensRefreshedSubscription Create(
            ProtonApiSession session,
            nint callerState,
            InteropAction<nint, InteropArray<byte>> tokensRefreshedAction)
        {
            var subscription = new TokensRefreshedSubscription(session, callerState, tokensRefreshedAction);

            session.TokenCredential.TokensRefreshed += subscription.Handle;

            return subscription;
        }

        public void Dispose()
        {
            _session.TokenCredential.TokensRefreshed -= Handle;
        }

        private void Handle(string accessToken, string refreshToken)
        {
            var tokensMessage = InteropArray<byte>.AllocFromMemory(new SessionTokens { AccessToken = accessToken, RefreshToken = refreshToken }.ToByteArray());

            try
            {
                _tokensRefreshedAction.Invoke(_callerState, tokensMessage);
            }
            finally
            {
                tokensMessage.Free();
            }
        }
    }
}
