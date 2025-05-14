using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;

namespace Proton.Sdk.Serialization;

internal sealed class ValResultJsonConverter<T, TError> : JsonConverter<ValResult<T, TError>>
    where T : struct
    where TError : class?
{
    public override ValResult<T, TError> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var dto = JsonSerializer.Deserialize(
            ref reader,
            (JsonTypeInfo<SerializableValResult<T, TError>>)options.GetTypeInfo(typeof(SerializableValResult<T, TError>)));

        ValResult<T, TError>? result;
        if (dto.IsSuccess)
        {
            if (dto.Value is null)
            {
                throw new JsonException("Missing \"Value\" property for success result.");
            }

            result = dto.Value;
        }
        else
        {
            result = dto.Error ?? throw new JsonException("Missing \"Error\" property for failure result.");
        }

        return result.Value;
    }

    public override void Write(Utf8JsonWriter writer, ValResult<T, TError> value, JsonSerializerOptions options)
    {
        var dto = value.TryGetValueElseError(out var innerValue, out var error)
            ? new SerializableValResult<T, TError> { IsSuccess = true, Value = innerValue.Value }
            : new SerializableValResult<T, TError> { Error = error };

        var jsonTypeInfo = (JsonTypeInfo<SerializableValResult<T, TError>>)options.GetTypeInfo(typeof(SerializableValResult<T, TError>));
        JsonSerializer.Serialize(writer, dto, jsonTypeInfo);
    }
}
