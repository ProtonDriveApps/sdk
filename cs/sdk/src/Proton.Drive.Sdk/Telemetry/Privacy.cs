namespace Proton.Drive.Sdk.Telemetry;

internal static class Privacy
{
    public static long ReduceSizePrecision(long size)
    {
        const long precision = 100_000;

        if (size == 0)
        {
            return 0;
        }

        // We care about very small files in metrics, thus we handle explicitly
        // the very small files so they appear correctly in metrics.
        if (size < 4096)
        {
            return 4095;
        }

        if (size < precision)
        {
            return precision;
        }

        return (size / precision) * precision;
    }
}
