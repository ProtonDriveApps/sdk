using System.Buffers;
using System.Text.Json;
using System.Text.Json.Serialization;
using Proton.Cryptography.Pgp;
using Proton.Sdk.Cryptography;

namespace Proton.Sdk.Serialization;

internal sealed class PgpArmoredBlockJsonConverter<T>(PgpBlockType blockType, Func<ReadOnlyMemory<byte>, T> factory) : JsonConverter<T>
    where T : IPgpArmoredBlock
{
    private readonly PgpBlockType _blockType = blockType;
    private readonly Func<ReadOnlyMemory<byte>, T> _factory = factory;

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

            return _factory.Invoke(decodedBlock);
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
            var numberOfBytesWritten = PgpArmorEncoder.Encode(value.Bytes.Span, _blockType, buffer);

            writer.WriteStringValue(buffer.AsSpan()[..numberOfBytesWritten]);
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }
    }
}
