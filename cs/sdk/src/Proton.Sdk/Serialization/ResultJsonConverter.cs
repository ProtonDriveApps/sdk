using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;

namespace Proton.Sdk.Serialization;

internal sealed class ResultJsonConverter<T, TError> : JsonConverter<Result<T, TError>>
{
    public override Result<T, TError> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var dto = JsonSerializer.Deserialize(
            ref reader,
            (JsonTypeInfo<SerializableResult<T, TError>>)options.GetTypeInfo(typeof(SerializableResult<T, TError>)));

        Result<T, TError>? result;
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
            if (dto.Error is null)
            {
                throw new JsonException("Missing \"Error\" property for failure result.");
            }

            result = dto.Error;
        }

        return result.Value;
    }

    public override void Write(Utf8JsonWriter writer, Result<T, TError> value, JsonSerializerOptions options)
    {
        var dto = value.TryGetValueElseError(out var innerValue, out var error)
            ? new SerializableResult<T, TError> { IsSuccess = true, Value = innerValue }
            : new SerializableResult<T, TError> { Error = error };

        JsonSerializer.Serialize(writer, dto, (JsonTypeInfo<SerializableResult<T, TError>>)options.GetTypeInfo(typeof(SerializableResult<T, TError>)));
    }
}
