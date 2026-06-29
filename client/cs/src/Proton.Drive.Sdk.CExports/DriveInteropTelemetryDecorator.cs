using System.Net;
using Google.Protobuf;
using Microsoft.Extensions.Logging;
using Proton.Drive.Sdk.Http;
using Proton.Drive.Sdk.Telemetry;
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
            DecryptionErrorEvent me => GetDecryptionErrorPayload(me),
            BlockVerificationErrorEvent me => GetBlockVerificationErrorPayload(me),
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
            ApproximateExpectedSize = me.ApproximateExpectedSize,
        };

        // Check if we should translate InteropErrorException when error is Unknown
        var error = me is { Error: Sdk.Telemetry.UploadError.Unknown, OriginalError: InteropErrorException interopError }
            ? TranslateToUploadError(interopError)
            : me.Error;

        if (error is not null)
        {
            payload.Error = (UploadError)error;
        }

        if (me.OriginalError is not null)
        {
            payload.OriginalError = me.OriginalError.GetBaseException().ToString();
        }

        return payload;
    }

    private static DownloadEventPayload GetDownloadEventPayload(DownloadEvent me)
    {
        var payload = new DownloadEventPayload
        {
            VolumeType = (VolumeType)me.VolumeType,
            DownloadedSize = me.DownloadedSize,
            ApproximateDownloadedSize = me.ApproximateDownloadedSize,
            ClaimedFileSize = me.ClaimedFileSize ?? 0,
            ApproximateClaimedFileSize = me.ApproximateClaimedFileSize ?? 0,
        };

        // Check if we should translate InteropErrorException when error is Unknown
        var error = me is { Error: Sdk.Telemetry.DownloadError.Unknown, OriginalError: InteropErrorException interopError }
            ? TranslateToDownloadError(interopError)
            : me.Error;

        if (error is not null)
        {
            payload.Error = (DownloadError)error;
        }

        if (me.OriginalError is not null)
        {
            payload.OriginalError = me.OriginalError.GetBaseException().ToString();
        }

        return payload;
    }

    private static BlockVerificationErrorEventPayload GetBlockVerificationErrorPayload(BlockVerificationErrorEvent me)
    {
        return new BlockVerificationErrorEventPayload
        {
            VolumeType = (VolumeType)me.VolumeType,
            RetryHelped = me.RetryHelped,
        };
    }

    private static DecryptionErrorEventPayload GetDecryptionErrorPayload(DecryptionErrorEvent me)
    {
        var payload = new DecryptionErrorEventPayload
        {
            VolumeType = (VolumeType)me.VolumeType,
            Field = (EncryptedField)me.Field,
            Uid = me.Uid.ToString(),
        };

        if (me.FromBefore2024.HasValue)
        {
            payload.FromBefore2024 = me.FromBefore2024.Value;
        }

        if (me.Error is not null)
        {
            payload.Error = me.Error;
        }

        return payload;
    }

    private static Sdk.Telemetry.UploadError? TranslateToUploadError(InteropErrorException exception)
    {
        if (exception.Error is null)
        {
            return Sdk.Telemetry.UploadError.Unknown;
        }

        var error = exception.Error;
        return exception.Error.Domain switch
        {
            ErrorDomain.Api => TranslateApiErrorToUploadError(error.SecondaryCode),
            ErrorDomain.Network or ErrorDomain.Transport => Sdk.Telemetry.UploadError.NetworkError,
            ErrorDomain.Serialization => Sdk.Telemetry.UploadError.HttpClientSideError,
            ErrorDomain.Cryptography or ErrorDomain.DataIntegrity => Sdk.Telemetry.UploadError.IntegrityError,
            ErrorDomain.BusinessLogic => Sdk.Telemetry.UploadError.ValidationError,
            _ => Sdk.Telemetry.UploadError.Unknown,
        };
    }

    private static Sdk.Telemetry.UploadError TranslateApiErrorToUploadError(long statusCode)
    {
        return statusCode switch
        {
            (int)HttpStatusCode.TooManyRequests => Sdk.Telemetry.UploadError.RateLimited,
            >= StatusCodes.MinClientErrorCode and <= StatusCodes.MaxClientErrorCode => Sdk.Telemetry.UploadError.HttpClientSideError,
            _ => Sdk.Telemetry.UploadError.ServerError,
        };
    }

    private static Sdk.Telemetry.DownloadError? TranslateToDownloadError(InteropErrorException exception)
    {
        if (exception.Error is null)
        {
            return Sdk.Telemetry.DownloadError.Unknown;
        }

        var error = exception.Error;
        return exception.Error.Domain switch
        {
            ErrorDomain.Api => TranslateApiErrorToDownloadError(error.SecondaryCode),
            ErrorDomain.Network or ErrorDomain.Transport => Sdk.Telemetry.DownloadError.NetworkError,
            ErrorDomain.Serialization => Sdk.Telemetry.DownloadError.HttpClientSideError,
            ErrorDomain.Cryptography or ErrorDomain.DataIntegrity => Sdk.Telemetry.DownloadError.IntegrityError,
            ErrorDomain.BusinessLogic => Sdk.Telemetry.DownloadError.ValidationError,
            _ => Sdk.Telemetry.DownloadError.Unknown,
        };
    }

    private static Sdk.Telemetry.DownloadError TranslateApiErrorToDownloadError(long statusCode)
    {
        return statusCode switch
        {
            (int)HttpStatusCode.TooManyRequests => Sdk.Telemetry.DownloadError.RateLimited,
            >= StatusCodes.MinClientErrorCode and <= StatusCodes.MaxClientErrorCode => Sdk.Telemetry.DownloadError.HttpClientSideError,
            _ => Sdk.Telemetry.DownloadError.ServerError,
        };
    }
}
