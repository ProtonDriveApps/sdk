namespace Proton.Sdk.Http;

internal static class HttpRequestMessageExtensions
{
    public static void SetRequestType(this HttpRequestMessage requestMessage, HttpRequestType requestType)
    {
        requestMessage.Options.Set(HttpRequestOptionKeys.RequestType, requestType);
    }

    public static HttpRequestType GetRequestType(this HttpRequestMessage requestMessage)
    {
        return requestMessage.Options.TryGetValue(HttpRequestOptionKeys.RequestType, out var requestType) ? requestType : HttpRequestType.RegularApi;
    }
}
