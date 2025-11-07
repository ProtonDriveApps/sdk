using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Proton.Sdk.Telemetry;

namespace Proton.Sdk.CExports;

internal sealed class InteropTelemetry(nint bindingsHandle, InteropAction<nint, InteropArray<byte>>? recordMetricAction, ILoggerFactory? loggerFactory)
    : ITelemetry
{
    private readonly InteropAction<nint, InteropArray<byte>>? _recordMetricAction = recordMetricAction;
    private readonly ILoggerFactory _loggerFactory = loggerFactory ?? NullLoggerFactory.Instance;
    private readonly nint _bindingsHandle = bindingsHandle;

    public ILogger GetLogger(string name)
    {
        return _loggerFactory.CreateLogger(name);
    }

    public void RecordMetric(IMetricEvent metricEvent)
    {
        IMessage payload = metricEvent.Name switch
        {
            _ => throw new NotSupportedException($"Unknown metric event \"{metricEvent.Name}\""),
        };

        RecordMetric(metricEvent.Name, payload);
    }

    public unsafe void RecordMetric(string eventName, IMessage payload)
    {
        var message = new MetricEvent
        {
            Name = eventName,
            Payload = Any.Pack(payload),
        };

        var messageBytes = message.ToByteArray();

        fixed (byte* messagePointer = messageBytes)
        {
            _recordMetricAction?.Invoke(_bindingsHandle, new InteropArray<byte>(messagePointer, messageBytes.Length));
        }
    }
}
