using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace Proton.Sdk.Telemetry;

public sealed class NullTelemetry : ITelemetry
{
    public static NullTelemetry Instance { get; } = new();

    public ILogger GetLogger(string name) => NullLogger.Instance;

    public void RecordMetric(IMetricEvent metricEvent)
    {
        // Do nothing
    }
}
