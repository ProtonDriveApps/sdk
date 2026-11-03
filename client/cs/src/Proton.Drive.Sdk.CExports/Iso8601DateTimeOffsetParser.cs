using System.Globalization;

namespace Proton.Drive.Sdk.CExports;

internal static class Iso8601DateTimeOffsetParser
{
    private static readonly string[] Formats =
    [
        "yyyy-MM-dd'T'HH:mm:ss.FFFFFFFzzz",
        "yyyy-MM-dd'T'HH:mm:ss.FFFFFFF'Z'",
    ];

    public static DateTimeOffset Parse(string value)
    {
        if (DateTimeOffset.TryParseExact(value, Formats, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var result))
        {
            return result;
        }

        // Digits are redacted to keep user data out of the message
        var redactedValue = string.Concat(value.Select(c => char.IsDigit(c) ? '#' : c));

        throw new FormatException($"Invalid ISO 8601 date and time with UTC offset: \"{redactedValue}\"");
    }
}
