using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Text;
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
    private static int NativeBegin(InteropArray sessionBeginRequestBytes, InteropAsyncCallback callback)
    {
        try
        {
            return callback.InvokeFor(ct => InteropBeginAsync(sessionBeginRequestBytes, ct));
        }
        catch
        {
            return -1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "session_resume", CallConvs = [typeof(CallConvCdecl)])]
    private static unsafe int NativeResume(InteropArray requestBytes, nint* sessionHandle)
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
    private static unsafe int NativeRenew(nint oldSessionHandle, InteropArray sessionRenewRequestBytes, nint* newSessionHandle)
    {
        try
        {
            var request = SessionRenewRequest.Parser.ParseFrom(sessionRenewRequestBytes.AsReadOnlySpan());

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
    private static int NativeEnd(nint sessionHandle, InteropAsyncCallback callback)
    {
        try
        {
            if (!TryGetFromHandle(sessionHandle, out var session))
            {
                return -1;
            }

            callback.InvokeFor(_ => InteropEndAsync(session));

            return 0;
        }
        catch
        {
            return -1;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "session_tokens_refreshed_subscribe", CallConvs = [typeof(CallConvCdecl)])]
    private static nint NativeSubscribeTokensRefreshed(nint sessionHandle, InteropTokensRefreshedCallback tokensRefreshedCallback)
    {
        try
        {
            if (!TryGetFromHandle(sessionHandle, out var session))
            {
                return 0;
            }

            Action<string, string> handler = (accessToken, refreshToken) => tokensRefreshedCallback.Invoke(accessToken, refreshToken);

            session.TokenCredential.TokensRefreshed += handler;

            return GCHandle.ToIntPtr(GCHandle.Alloc(handler));
        }
        catch
        {
            return 0;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "session_tokens_refreshed_unsubscribe", CallConvs = [typeof(CallConvCdecl)])]
    private static int NativeUnsubscribeTokensRefreshed(nint sessionHandle, nint subscriptionHandle)
    {
        try
        {
            if (!TryGetFromHandle(sessionHandle, out var session))
            {
                return -1;
            }

            if (!TryGetTokensExpiredSubscriptionFromHandle(subscriptionHandle, out var handler))
            {
                return -1;
            }

            session.TokenCredential.TokensRefreshed -= handler;

            return 0;
        }
        catch
        {
            return -1;
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

    private static async ValueTask<Result<InteropArray, InteropArray>> InteropBeginAsync(InteropArray requestBytes, CancellationToken cancellationToken)
    {
        try
        {
            var request = SessionBeginRequest.Parser.ParseFrom(requestBytes.AsReadOnlySpan());

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

            var handle = GCHandle.ToIntPtr(GCHandle.Alloc(session));
            return ResultExtensions.Success(new IntResponse { Value = handle });
        }
        catch (Exception e)
        {
            return ResultExtensions.Failure(e, InteropErrorConverter.SetDomainAndCodes);
        }
    }

    private static async ValueTask<Result<InteropArray, InteropArray>> InteropEndAsync(ProtonApiSession session)
    {
        try
        {
            await session.EndAsync().ConfigureAwait(false);

            return ResultExtensions.Success();
        }
        catch (Exception e)
        {
            return ResultExtensions.Failure(e, InteropErrorConverter.SetDomainAndCodes);
        }
    }

    private static bool TryGetTokensExpiredSubscriptionFromHandle(nint handle, [MaybeNullWhen(false)] out Action<string, string> handler)
    {
        if (handle == 0)
        {
            handler = null;
            return false;
        }

        var gcHandle = GCHandle.FromIntPtr(handle);

        handler = gcHandle.Target as Action<string, string>;

        return handler is not null;
    }
}
