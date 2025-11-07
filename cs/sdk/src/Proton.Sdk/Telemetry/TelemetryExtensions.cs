using Microsoft.Extensions.Logging;

namespace Proton.Sdk.Telemetry;

public static class TelemetryExtensions
{
    public static ILogger<T> GetLogger<T>(this ITelemetry telemetry)
    {
        return new Logger<T>(new TelemetryLoggerFactory(telemetry));
    }

    public static ILoggerFactory ToLoggerFactory(this ITelemetry telemetry)
    {
        return new TelemetryLoggerFactory(telemetry);
    }

    private sealed class TelemetryLoggerFactory(ITelemetry telemetry) : ILoggerFactory
    {
        public ILogger CreateLogger(string categoryName)
        {
            return telemetry.GetLogger(categoryName);
        }

        public void AddProvider(ILoggerProvider provider)
        {
            throw new NotSupportedException();
        }

        public void Dispose()
        {
        }
    }
}
