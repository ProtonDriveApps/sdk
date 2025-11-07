using Microsoft.Extensions.Logging;

namespace Proton.Sdk.Telemetry;

public interface ITelemetry
{
    ILogger GetLogger(string name);

    void RecordMetric(IMetricEvent metricEvent);
}
