using System.Text.Json;
using System.Text.Json.Serialization;

namespace Proton.Sdk.Serialization;

public sealed class ForgivingBytesToHexJsonConverter : JsonConverter<ReadOnlyMemory<byte>>
{
    public override ReadOnlyMemory<byte> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null || reader.GetValueLength() is not (var valueLength and > 0))
        {
            return ReadOnlyMemory<byte>.Empty;
        }

        try
        {
            if (reader.HasUnescapedValueSpan)
            {
                return Convert.FromHexString(reader.ValueSpan);
            }

            var unescapedValueBuffer = MemoryPolicy.IsTooLargeForStack<byte>(valueLength) ? new byte[valueLength] : stackalloc byte[valueLength];

            var unescapedValueLength = reader.CopyString(unescapedValueBuffer);

            return Convert.FromHexString(unescapedValueBuffer[..unescapedValueLength]);
        }
        catch
        {
            // TODO: Use some explicit fallback mechanism on the DTO attribute instead, and make this converter non-forgiving
            return ReadOnlyMemory<byte>.Empty;
        }
    }

    public override void Write(Utf8JsonWriter writer, ReadOnlyMemory<byte> value, JsonSerializerOptions options)
    {
        if (value.Length == 0)
        {
            writer.WriteNullValue();
            return;
        }

        var maxByteCount = value.Length * 2;

        var hexStringBuffer = MemoryPolicy.IsTooLargeForStack<byte>(maxByteCount) ? new byte[maxByteCount] : stackalloc byte[maxByteCount];

        if (!Convert.TryToHexStringLower(value.Span, hexStringBuffer, out var hexStringLength))
        {
            throw new JsonException("Could not convert to hex string");
        }

        writer.WriteStringValue(hexStringBuffer[..hexStringLength]);
    }
}
