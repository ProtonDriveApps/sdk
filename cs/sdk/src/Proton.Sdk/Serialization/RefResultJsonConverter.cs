using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;

namespace Proton.Sdk.Serialization;

internal sealed class RefResultJsonConverter<T, TError> : JsonConverter<RefResult<T, TError>>
    where T : class?
    where TError : class?
{
    public override RefResult<T, TError> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var dto = JsonSerializer.Deserialize(
            ref reader,
            (JsonTypeInfo<SerializableRefResult<T, TError>>)options.GetTypeInfo(typeof(SerializableRefResult<T, TError>)));

        RefResult<T, TError>? result;
        if (dto.IsSuccess)
        {
            result = dto.Value ?? throw new JsonException("Missing \"Value\" property for success result.");
        }
        else
        {
            result = dto.Error ?? throw new JsonException("Missing \"Error\" property for failure result.");
        }

        return result.Value;
    }

    public override void Write(Utf8JsonWriter writer, RefResult<T, TError> value, JsonSerializerOptions options)
    {
        var dto = value.TryGetValueElseError(out var innerValue, out var error)
            ? new SerializableRefResult<T, TError> { IsSuccess = true, Value = innerValue }
            : new SerializableRefResult<T, TError> { Error = error };

        var jsonTypeInfo = (JsonTypeInfo<SerializableRefResult<T, TError>>)options.GetTypeInfo(typeof(SerializableRefResult<T, TError>));
        JsonSerializer.Serialize(writer, dto, jsonTypeInfo);
    }
}
