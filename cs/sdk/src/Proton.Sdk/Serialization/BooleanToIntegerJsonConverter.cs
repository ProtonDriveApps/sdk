using System.Text.Json;
using System.Text.Json.Serialization;

namespace Proton.Sdk.Serialization;

internal sealed class BooleanToIntegerJsonConverter : JsonConverter<bool>
{
    public override bool Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var number = reader.GetInt32();
        return number != 0;
    }

    public override void Write(Utf8JsonWriter writer, bool value, JsonSerializerOptions options)
    {
        writer.WriteNumberValue(value ? 1 : 0);
    }
}
