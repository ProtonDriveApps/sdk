using System.Text.Json;
using System.Text.Json.Serialization;

namespace Proton.Sdk.Serialization;

internal sealed class ResultJsonConverter<T, TError> : JsonConverter<Result<T, TError>>
{
    public override Result<T, TError>? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var dto = JsonSerializer.Deserialize<SerializableResult<T, TError>>(ref reader, options);

        Result<T, TError>? result;
        if (dto.Successful)
        {
            if (dto.Value is null)
            {
                return null;
            }

            result = dto.Value;
        }
        else
        {
            if (dto.Error is null)
            {
                return null;
            }

            result = dto.Error;
        }

        return result;
    }

    public override void Write(Utf8JsonWriter writer, Result<T, TError> value, JsonSerializerOptions options)
    {
        var dto = value.TryGetValue(out var innerValue, out var error)
            ? new SerializableResult<T, TError> { Successful = true, Value = innerValue }
            : new SerializableResult<T, TError> { Error = error };

        JsonSerializer.Serialize(writer, dto, options);
    }
}
