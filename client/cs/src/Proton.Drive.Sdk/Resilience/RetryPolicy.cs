using System.Net;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Resilience;

internal readonly struct RetryPolicy
{
    public static TimeSpan GetAttemptDelay(int retryNumber)
    {
        var baseSeconds = Math.Pow(2.0, retryNumber - 2);

        var jitteredSeconds = baseSeconds + (Random.Shared.NextDouble() * baseSeconds);

        return TimeSpan.FromSeconds(jitteredSeconds);
    }

    public static bool IsRetriable(Exception exception)
    {
        return exception switch
        {
            TooManyRequestsException => true,
            ProtonApiException e => StatusCodeIsRetriable(e.TransportCode),
            HttpRequestException e => StatusCodeIsRetriable((int?)e.StatusCode),
            _ => true,
        };
    }

    // A 4xx cannot succeed on a replay, except 408 and 429, and 404, which is only retriable because both callers re-request the transfer target.
    private static bool StatusCodeIsRetriable(int? statusCode)
    {
        return statusCode is not (>= 400 and < 500)
            || statusCode is (int)HttpStatusCode.RequestTimeout or (int)HttpStatusCode.NotFound or (int)HttpStatusCode.TooManyRequests;
    }
}
