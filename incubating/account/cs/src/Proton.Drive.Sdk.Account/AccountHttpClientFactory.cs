using Proton.Sdk;

namespace Proton.Drive.Sdk.Account;

internal static class AccountHttpClientFactory
{
    public static HttpClient GetHttpClient(
        this AccountClientConfiguration config,
        ProtonApiSession? session = null,
        string? baseRoutePath = null,
        TimeSpan? attemptTimeout = null,
        TimeSpan? totalTimeout = null)
    {
        return config.Sdk.GetHttpClient(
            baseRoutePath,
            attemptTimeout,
            totalTimeout,
            session is null ? null : () => new Authentication.AuthorizationHandler(session));
    }
}
