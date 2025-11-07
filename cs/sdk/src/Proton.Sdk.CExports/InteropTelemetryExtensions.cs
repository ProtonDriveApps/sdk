using Microsoft.Extensions.Logging;
using Proton.Sdk.CExports.Logging;

namespace Proton.Sdk.CExports;

internal static class InteropTelemetryExtensions
{
    public static InteropTelemetry? ToTelemetry(this Telemetry telemetry, nint bindingsHandle)
    {
        var loggerFactory = GetLoggerFactory(telemetry, bindingsHandle);

        var recordMetricAction = telemetry.HasRecordMetricAction
            ? new InteropAction<IntPtr, InteropArray<byte>>(telemetry.RecordMetricAction)
            : default(InteropAction<IntPtr, InteropArray<byte>>?);

        if (loggerFactory is null && recordMetricAction is null)
        {
            return null;
        }

        return new InteropTelemetry(bindingsHandle, recordMetricAction, loggerFactory);
    }

    private static LoggerFactory? GetLoggerFactory(Telemetry telemetry, nint bindingsHandle)
    {
        if (telemetry.HasLoggerProviderHandle)
        {
            var loggerProvider = Interop.GetFromHandle<InteropLoggerProvider>(telemetry.LoggerProviderHandle);
            return new LoggerFactory([loggerProvider]);
        }

        if (telemetry.HasLogAction)
        {
            var logAction = new InteropAction<IntPtr, InteropArray<byte>>(telemetry.LogAction);
            return new LoggerFactory([new InteropLoggerProvider(bindingsHandle, logAction)]);
        }

        return null;
    }
}
