using System.Text.Json;
using System.Text.Json.Serialization;

namespace Proton.Sdk.Serialization;

internal sealed class EpochSecondsJsonConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var number = reader.GetInt64();
        return DateTimeOffset.FromUnixTimeSeconds(number).DateTime;
    }

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
    {
        writer.WriteNumberValue(new DateTimeOffset(value).ToUnixTimeSeconds());
    }
}
