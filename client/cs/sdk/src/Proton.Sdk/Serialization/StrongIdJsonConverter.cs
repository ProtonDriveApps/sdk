using System.Text.Json;
using System.Text.Json.Serialization;

namespace Proton.Sdk.Serialization;

public sealed class StrongIdJsonConverter<T> : JsonConverter<T>
    where T : struct, IStrongId<T>
{
    public override T Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        return reader.TokenType is JsonTokenType.String && reader.GetString() is { Length: > 0 } value
            ? (T)value
            : throw new JsonException($"Failed to convert JSON token of type {reader.TokenType} and of length {reader.GetValueLength()} to {typeof(T).Name}");
    }

    public override void Write(Utf8JsonWriter writer, T value, JsonSerializerOptions options)
    {
        writer.WriteStringValue(value);
    }
}
