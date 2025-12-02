using Google.Protobuf;
using Microsoft.Extensions.Logging;
using Proton.Drive.Sdk.Telemetry;
using Proton.Sdk.CExports;
using Proton.Sdk.Telemetry;

namespace Proton.Drive.Sdk.CExports;

internal sealed class DriveInteropTelemetryDecorator(InteropTelemetry instanceToDecorate) : ITelemetry
{
    private readonly InteropTelemetry _instanceToDecorate = instanceToDecorate;

    public ILogger GetLogger(string name)
    {
        return _instanceToDecorate.GetLogger(name);
    }

    public void RecordMetric(IMetricEvent metricEvent)
    {
        IMessage? payload = metricEvent switch
        {
            UploadEvent me => GetUploadEventPayload(me),
            DownloadEvent me => GetDownloadEventPayload(me),
            _ => null,
        };

        if (payload is null)
        {
            _instanceToDecorate.RecordMetric(metricEvent);
            return;
        }

        _instanceToDecorate.RecordMetric(metricEvent.Name, payload);
    }

    private static UploadEventPayload GetUploadEventPayload(UploadEvent me)
    {
        var payload = new UploadEventPayload
        {
            VolumeType = (VolumeType)me.VolumeType,
            UploadedSize = me.UploadedSize,
            ApproximateUploadedSize = me.ApproximateUploadedSize,
            ExpectedSize = me.ExpectedSize,
        };

        if (me.Error is not null)
        {
            payload.Error = (UploadError)me.Error;
        }

        if (me.OriginalError is not null)
        {
            payload.OriginalError = me.OriginalError;
        }

        return payload;
    }

    private static DownloadEventPayload GetDownloadEventPayload(DownloadEvent me)
    {
        var payload = new DownloadEventPayload
        {
            VolumeType = (VolumeType)me.VolumeType,
            DownloadedSize = me.DownloadedSize,
            ClaimedFileSize = me.ClaimedFileSize,
        };

        if (me.Error is not null)
        {
            payload.Error = (DownloadError)me.Error;
        }

        if (me.OriginalError is not null)
        {
            payload.OriginalError = me.OriginalError;
        }

        return payload;
    }
}
