using System.Buffers;
using System.Text.Json;
using System.Text.Json.Serialization;
using Proton.Cryptography.Pgp;
using Proton.Sdk.Cryptography;

namespace Proton.Sdk.Serialization;

internal abstract class PgpArmoredBlockJsonConverterBase<T> : JsonConverter<T>
    where T : IPgpArmoredBlock<T>
{
    protected abstract PgpBlockType BlockType { get; }

    public override T Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.String)
        {
            throw new JsonException($"Unexpected token type '{reader.TokenType}', expected '{nameof(JsonTokenType.String)}'");
        }

        var buffer = ArrayPool<byte>.Shared.Rent(reader.ValueSpan.Length);

        try
        {
            var numberOfBytesCopied = reader.CopyString(buffer);

            var decodedBlock = PgpArmorDecoder.Decode(buffer.AsSpan()[..numberOfBytesCopied]);

            return CreateValue(decodedBlock);
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }
    }

    public override void Write(Utf8JsonWriter writer, T value, JsonSerializerOptions options)
    {
        var buffer = ArrayPool<byte>.Shared.Rent(PgpArmorEncoder.GetMaxLengthAfterEncoding(value.Bytes.Length));

        try
        {
            var numberOfBytesWritten = PgpArmorEncoder.Encode(value, BlockType, buffer);

            writer.WriteStringValue(buffer.AsSpan()[..numberOfBytesWritten]);
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }
    }

    protected abstract T CreateValue(ReadOnlyMemory<byte> bytes);
}
