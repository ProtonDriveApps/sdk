using Proton.Drive.Sdk.Nodes.Upload;

namespace Proton.Drive.Sdk.Telemetry;

/// <summary>
/// Derives the per-file upload performance observations from a completed upload. Lives in the SDK so that every
/// client reports the same values rather than each re-implementing the arithmetic.
/// </summary>
internal static class UploadPerformanceEventFactory
{
    /// <summary>Derives the performance observations for one successfully completed upload.</summary>
    /// <param name="context">The completed upload measurement, carrying timing and raw upload statistics.</param>
    /// <param name="totalTime">
    /// Time since the SDK learned it had to upload the file, including the wait for a transfer-queue slot.
    /// Measured on the same monotonic clock as the active time.
    /// </param>
    public static IEnumerable<UploadPerformanceEvent> Create(UploadMetricsContext context, TimeSpan totalTime)
    {
        if (context.Statistics is not { } statistics)
        {
            yield break;
        }

        var uploadRoute = statistics.IsSmallUpload ? UploadRoute.Small : UploadRoute.Block;
        var sizeClass = UploadClassification.GetSizeClass(statistics.EncryptedContentSize, statistics.ContentBlockCount);
        var blockCount = UploadClassification.GetBlockCount(statistics.ContentBlockCount);

        // A non-positive total can only mean the measurement is broken, because the clock is monotonic.
        // In that case no metric is derived at all, not even the duration.
        if (totalTime <= TimeSpan.Zero)
        {
            yield break;
        }

        if (TryGetPercentage(context.ActiveTime, totalTime, out var share))
        {
            var shareMetric = uploadRoute is UploadRoute.Small
                ? UploadPerformanceMetric.SmallRouteActiveTimeShare
                : UploadPerformanceMetric.LargeRouteActiveTimeShare;

            yield return CreateEvent(uploadRoute, sizeClass, blockCount, shareMetric, share);
        }

        if (!TryGetThroughput(statistics.EncryptedContentSize, context.ActiveTime, out var kibibytesPerSecond))
        {
            yield break;
        }

        // Small and large files are separate metrics because their buckets are tuned to different ranges.
        var throughputMetric = sizeClass is UploadSizeClass.Small
            ? UploadPerformanceMetric.SmallFileThroughput
            : UploadPerformanceMetric.LargeFileThroughput;

        yield return CreateEvent(uploadRoute, sizeClass, blockCount, throughputMetric, kibibytesPerSecond);
    }

    private static UploadPerformanceEvent CreateEvent(
        UploadRoute uploadRoute,
        UploadSizeClass sizeClass,
        UploadBlockCount blockCount,
        UploadPerformanceMetric metric,
        long value)
    {
        return new UploadPerformanceEvent
        {
            Metric = metric,
            Value = value,
            UploadRoute = uploadRoute,
            SizeClass = sizeClass,
            BlockCount = blockCount,
        };
    }

    private static bool TryGetWholeNumber(double value, out long wholeNumber)
    {
        if (!double.IsFinite(value) || value < 0 || value >= long.MaxValue)
        {
            wholeNumber = 0;
            return false;
        }

        // Floored so that an observation just above a bucket boundary is never lifted into the next bucket.
        wholeNumber = (long)Math.Floor(value);
        return true;
    }

    private static bool TryGetPercentage(TimeSpan activeTime, TimeSpan totalTime, out long percentage)
    {
        // Both times come from the same monotonic clock and the active window starts later, so the share cannot
        // exceed 100. The caller guarantees a positive total; a negative active time is rejected here.
        if (activeTime < TimeSpan.Zero)
        {
            percentage = 0;
            return false;
        }

        // Integer arithmetic: through doubles, a ratio that is exactly a whole percent can land just below it
        // and then be floored into the wrong bucket (29 ms of 100 ms -> 28.999... -> 28). The multiplication
        // cannot realistically overflow: it would take an active time of about three years.
        percentage = activeTime.Ticks * 100 / totalTime.Ticks;
        return true;
    }

    private static bool TryGetThroughput(long encryptedContentSize, TimeSpan activeTime, out long kibibytesPerSecond)
    {
        if (activeTime > TimeSpan.Zero)
        {
            return TryGetWholeNumber(encryptedContentSize / 1024d / activeTime.TotalSeconds, out kibibytesPerSecond);
        }

        kibibytesPerSecond = 0;
        return false;
    }
}
