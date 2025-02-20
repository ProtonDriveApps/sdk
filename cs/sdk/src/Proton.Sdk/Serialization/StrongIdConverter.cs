using System.Text.Json;
using System.Text.Json.Serialization;

namespace Proton.Sdk.Serialization;

internal sealed class StrongIdConverter<T> : JsonConverter<T>
    where T : struct, IStrongId<T>
{
    public override T Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var value = reader.GetString();
        return value ?? default(T);
    }

    public override void Write(Utf8JsonWriter writer, T value, JsonSerializerOptions options)
    {
        writer.WriteStringValue(value);
    }
}
