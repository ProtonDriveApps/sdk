namespace Proton.Sdk.Http;

internal static class HttpRequestMessageExtensions
{
    public static void DisableRetry(this HttpRequestMessage requestMessage)
    {
        requestMessage.Options.Set(HttpRequestOptions.DisableRetryKey, true);
    }

    public static bool GetRetryIsDisabled(this HttpRequestMessage requestMessage)
    {
        return requestMessage.Options.TryGetValue(HttpRequestOptions.DisableRetryKey, out var isDisabled) && isDisabled;
    }
}
