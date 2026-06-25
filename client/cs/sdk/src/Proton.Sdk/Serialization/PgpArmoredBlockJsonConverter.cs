using System.Buffers;
using System.Text.Json;
using System.Text.Json.Serialization;
using Proton.Sdk.Cryptography;

namespace Proton.Sdk.Serialization;

public sealed class PgpArmoredBlockJsonConverter<T> : JsonConverter<T>
    where T : IPgpArmoredBlock<T>
{
    public override T Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.String)
        {
            throw new JsonException(
                $"Unexpected token type '{reader.TokenType}' when converting to {typeof(T).Name}, expected '{nameof(JsonTokenType.String)}'");
        }

        if (reader.HasUnescapedValueSpan)
        {
            return T.Create(reader.ValueSpan);
        }

        var unescapedValueBuffer = ArrayPool<byte>.Shared.Rent(reader.GetValueLength());

        try
        {
            var unescapedValueLength = reader.CopyString(unescapedValueBuffer);

            return T.Create(unescapedValueBuffer.AsSpan()[..unescapedValueLength]);
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(unescapedValueBuffer);
        }
    }

    public override void Write(Utf8JsonWriter writer, T value, JsonSerializerOptions options)
    {
        var buffer = ArrayPool<byte>.Shared.Rent(value.GetExportRequiredBufferLength());

        try
        {
            var numberOfBytesWritten = value.Export(buffer);

            writer.WriteStringValue(buffer.AsSpan()[..numberOfBytesWritten]);
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }
    }
}
