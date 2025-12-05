namespace Proton.Drive.Sdk.Resilience;

internal readonly struct RetryPolicy
{
    public static TimeSpan GetAttemptDelay(int retryNumber)
    {
        var baseSeconds = Math.Pow(2.0, retryNumber - 2);

        var jitteredSeconds = baseSeconds + (Random.Shared.NextDouble() * baseSeconds);

        return TimeSpan.FromSeconds(jitteredSeconds);
    }
}
