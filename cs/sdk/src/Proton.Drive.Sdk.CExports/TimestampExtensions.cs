using Google.Protobuf.WellKnownTypes;

namespace Proton.Drive.Sdk.CExports;

internal static class TimestampExtensions
{
    // Workaround for issue: http://github.com/protocolbuffers/protobuf/issues/26006
    public static DateTime ToDateTimeFixed(this Timestamp timestamp)
    {
        try
        {
            return timestamp.ToDateTime();
        }
        catch (InvalidOperationException e)
        {
            throw new InvalidOperationException($"Timestamp contains invalid values: Seconds={timestamp.Seconds}; Nanos={timestamp.Nanos}", e);
        }
    }
}
