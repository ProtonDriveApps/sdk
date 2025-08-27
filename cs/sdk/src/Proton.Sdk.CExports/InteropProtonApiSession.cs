using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Text;
using Google.Protobuf;
using Microsoft.Extensions.Logging;
using Proton.Sdk.Authentication;
using Proton.Sdk.Caching;
using Proton.Sdk.CExports.Logging;

namespace Proton.Sdk.CExports;

internal static class InteropProtonApiSession
{
    internal static bool TryGetFromHandle(nint handle, [MaybeNullWhen(false)] out ProtonApiSession session)
    {
        if (handle == 0)
        {
            session = null;
            return false;
        }

        var gcHandle = GCHandle.FromIntPtr(handle);

        session = gcHandle.Target as ProtonApiSession;

        return session is not null;
    }

    [UnmanagedCallersOnly(EntryPoint = "session_begin", CallConvs = [typeof(CallConvCdecl)])]
    private static unsafe int NativeBegin(InteropArray<byte> requestBytes, void* callerState, InteropAsyncValueCallback<nint> resultCallback)
    {
        try
        {
            var request = SessionBeginRequest.Parser.ParseFrom(requestBytes.AsReadOnlySpan());

            return resultCallback.InvokeFor(callerState, ct => InteropBeginAsync(request, ct));
        }
        catch
        {
            return -1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "session_resume", CallConvs = [typeof(CallConvCdecl)])]
    private static unsafe int NativeResume(InteropArray<byte> requestBytes, nint* sessionHandle)
    {
        try
        {
            var request = SessionResumeRequest.Parser.ParseFrom(requestBytes.AsReadOnlySpan());

            ILoggerFactory? loggerFactory = null;

            if (request.Options.HasLoggerProviderHandle
                && InteropLoggerProvider.TryGetFromHandle((nint)request.Options.LoggerProviderHandle, out var loggerProvider))
            {
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
                new Authentication.SessionId(request.SessionId.Value),
                request.Username,
                new Users.UserId(request.UserId.Value),
                request.AccessToken,
                request.RefreshToken,
                request.Scopes,
                request.IsWaitingForSecondFactorCode,
                passwordMode,
                request.AppVersion,
                secretCacheRepository,
                options);

            *sessionHandle = GCHandle.ToIntPtr(GCHandle.Alloc(session));
            return 0;
        }
        catch
        {
            return -1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "session_renew", CallConvs = [typeof(CallConvCdecl)])]
    private static unsafe int NativeRenew(nint oldSessionHandle, InteropArray<byte> requestBytes, nint* newSessionHandle)
    {
        try
        {
            var request = SessionRenewRequest.Parser.ParseFrom(requestBytes.AsReadOnlySpan());

            if (!TryGetFromHandle(oldSessionHandle, out var expiredSession))
            {
                return -1;
            }

            var passwordMode = request.IsWaitingForDataPassword ? PasswordMode.Dual : PasswordMode.Single;

            var session = ProtonApiSession.Renew(
                expiredSession,
                new Authentication.SessionId(request.SessionId.Value),
                request.AccessToken,
                request.RefreshToken,
                request.Scopes,
                request.IsWaitingForSecondFactorCode,
                passwordMode);

            *newSessionHandle = GCHandle.ToIntPtr(GCHandle.Alloc(session));

            return 0;
        }
        catch
        {
            return -1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "session_end", CallConvs = [typeof(CallConvCdecl), typeof(CallConvMemberFunction)])]
    private static unsafe int NativeEnd(nint sessionHandle, void* callerState, InteropAsyncVoidCallback resultCallback)
    {
        try
        {
            if (!TryGetFromHandle(sessionHandle, out var session))
            {
                return -1;
            }

            resultCallback.InvokeFor(callerState, _ => InteropEndAsync(session));

            return 0;
        }
        catch
        {
            return -1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "session_tokens_refreshed_subscribe", CallConvs = [typeof(CallConvCdecl)])]
    private static unsafe nint NativeSubscribeTokensRefreshed(
        nint sessionHandle,
        void* callerState,
        InteropValueCallback<InteropArray<byte>> tokensRefreshedCallback)
    {
        try
        {
            if (!TryGetFromHandle(sessionHandle, out var session))
            {
                return 0;
            }

            var subscription = TokensRefreshedSubscription.Create(session, callerState, tokensRefreshedCallback);

            return GCHandle.ToIntPtr(GCHandle.Alloc(subscription));
        }
        catch
        {
            return 0;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "session_tokens_refreshed_unsubscribe", CallConvs = [typeof(CallConvCdecl)])]
    private static void NativeUnsubscribeTokensRefreshed(nint subscriptionHandle)
    {
        try
        {
            if (!TryGetTokensExpiredSubscriptionFromHandle(subscriptionHandle, out var unregisterAction))
            {
                return;
            }

            unregisterAction.Dispose();
        }
        catch
        {
            // Ignore
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "session_free", CallConvs = [typeof(CallConvCdecl)])]
    private static void NativeFree(nint handle)
    {
        try
        {
            var gcHandle = GCHandle.FromIntPtr(handle);

            if (gcHandle.Target is not ProtonApiSession)
            {
                return;
            }

            gcHandle.Free();
        }
        catch
        {
            // Ignore
        }
    }

    private static async ValueTask<Result<nint, InteropArray<byte>>> InteropBeginAsync(
        SessionBeginRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            ILoggerFactory? loggerFactory = null;

            if (request.Options.HasLoggerProviderHandle
                && InteropLoggerProvider.TryGetFromHandle((nint)request.Options.LoggerProviderHandle, out var loggerProvider))
            {
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

            return GCHandle.ToIntPtr(GCHandle.Alloc(session));
        }
        catch (Exception e)
        {
            return InteropResultExtensions.Failure<nint>(e, InteropErrorConverter.SetDomainAndCodes);
        }
    }

    private static async ValueTask<Result<InteropArray<byte>>> InteropEndAsync(ProtonApiSession session)
    {
        try
        {
            await session.EndAsync().ConfigureAwait(false);

            return Result<InteropArray<byte>>.Success;
        }
        catch (Exception e)
        {
            return InteropResultExtensions.Failure(e, InteropErrorConverter.SetDomainAndCodes);
        }
    }

    private static bool TryGetTokensExpiredSubscriptionFromHandle(nint handle, [MaybeNullWhen(false)] out TokensRefreshedSubscription subscription)
    {
        if (handle == 0)
        {
            subscription = null;
            return false;
        }

        var gcHandle = GCHandle.FromIntPtr(handle);

        subscription = gcHandle.Target as TokensRefreshedSubscription;

        return subscription is not null;
    }

    private sealed unsafe class TokensRefreshedSubscription : IDisposable
    {
        private readonly ProtonApiSession _session;
        private readonly void* _callerState;
        private readonly InteropValueCallback<InteropArray<byte>> _tokensRefreshedCallback;

        private TokensRefreshedSubscription(ProtonApiSession session, void* callerState, InteropValueCallback<InteropArray<byte>> tokensRefreshedCallback)
        {
            _session = session;
            _callerState = callerState;
            _tokensRefreshedCallback = tokensRefreshedCallback;
        }

        public static TokensRefreshedSubscription Create(
            ProtonApiSession session,
            void* callerState,
            InteropValueCallback<InteropArray<byte>> tokensRefreshedCallback)
        {
            var subscription = new TokensRefreshedSubscription(session, callerState, tokensRefreshedCallback);

            session.TokenCredential.TokensRefreshed += subscription.Handle;

            return subscription;
        }

        public void Dispose()
        {
            _session.TokenCredential.TokensRefreshed -= Handle;
        }

        private void Handle(string accessToken, string refreshToken)
        {
            var tokensMessage = InteropArray<byte>.FromMemory(new SessionTokens { AccessToken = accessToken, RefreshToken = refreshToken }.ToByteArray());

            try
            {
                _tokensRefreshedCallback.Invoke(_callerState, tokensMessage);
            }
            finally
            {
                tokensMessage.Free();
            }
        }
    }
}
