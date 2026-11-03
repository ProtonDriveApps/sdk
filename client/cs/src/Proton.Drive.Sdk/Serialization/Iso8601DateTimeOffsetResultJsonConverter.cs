using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Proton.Drive.Sdk;

namespace Proton.Sdk.Serialization;

public sealed class Iso8601DateTimeOffsetResultJsonConverter : JsonConverter<Result<DateTimeOffset, ProtonDriveError>?>
{
    public override bool HandleNull => true;

    public override Result<DateTimeOffset, ProtonDriveError>? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType is JsonTokenType.Null)
        {
            return null;
        }

        if (reader.TokenType is not JsonTokenType.String)
        {
            return new ProtonDriveError($"Expected token type {JsonTokenType.String}, received {reader.TokenType} instead.");
        }

        if (!reader.TryGetDateTimeOffset(out var value) && !TryFallbackToDateTimeOffsetParser(ref reader, out value))
        {
            var redactedValue = reader.GetString() is { } valueString
                ? string.Concat(valueString.Select(c => char.IsDigit(c) ? '#' : c))
                : string.Empty;

            return new ProtonDriveError($"Failed to parse date and time from '{redactedValue}'.");
        }

        return value;
    }

    public override void Write(Utf8JsonWriter writer, Result<DateTimeOffset, ProtonDriveError>? value, JsonSerializerOptions options)
    {
        if (value is { } result && result.TryGetValue(out var dateTimeOffset))
        {
            writer.WriteStringValue(dateTimeOffset.ToString("O", CultureInfo.InvariantCulture));
        }
        else
        {
            writer.WriteNullValue();
        }
    }

    private static bool TryFallbackToDateTimeOffsetParser(ref Utf8JsonReader reader, out DateTimeOffset value)
    {
        var maxCharacterCount = reader.GetValueMaxCharacterCount();

        var unescapedCharactersBuffer = MemoryPolicy.IsTooLargeForStack<char>(maxCharacterCount)
            ? new char[maxCharacterCount]
            : stackalloc char[maxCharacterCount];

        var unescapedCharacterCount = reader.CopyString(unescapedCharactersBuffer);

        var unescapedCharacters = unescapedCharactersBuffer[..unescapedCharacterCount];

        return DateTimeOffset.TryParse(unescapedCharacters, DateTimeFormatInfo.InvariantInfo, DateTimeStyles.RoundtripKind, out value);
    }
}
