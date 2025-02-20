using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Proton.Sdk.Serialization;

internal sealed class ForgivingBytesToHexJsonConverter : JsonConverter<ReadOnlyMemory<byte>>
{
    public override ReadOnlyMemory<byte> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.ValueSpan.Length == 0)
        {
            return ReadOnlyMemory<byte>.Empty;
        }

        var maxCharacterCount = Encoding.UTF8.GetMaxCharCount(reader.ValueSpan.Length);
        var characterBuffer = MemoryProvider.GetHeapMemoryIfTooLargeForStack<char>(maxCharacterCount, out var charactersHeapMemoryOwner)
            ? charactersHeapMemoryOwner.Memory.Span
            : stackalloc char[maxCharacterCount];

        using (charactersHeapMemoryOwner)
        {
            var characterCount = reader.CopyString(characterBuffer);

            try
            {
                return Convert.FromHexString(characterBuffer[..characterCount]);
            }
            catch
            {
                // TODO: Use some explicit fallback mechanism on the DTO attribute instead, and make this converter non-forgiving
                return ReadOnlyMemory<byte>.Empty;
            }
        }
    }

    public override void Write(Utf8JsonWriter writer, ReadOnlyMemory<byte> value, JsonSerializerOptions options)
    {
        if (value.Length == 0)
        {
            return;
        }

        var maxCharacterCount = value.Length * 2;
        var characterBuffer = MemoryProvider.GetHeapMemoryIfTooLargeForStack<char>(maxCharacterCount, out var charactersHeapMemoryOwner)
            ? charactersHeapMemoryOwner.Memory.Span
            : stackalloc char[maxCharacterCount];

        if (!Convert.TryToHexStringLower(value.Span, characterBuffer, out var byteCount))
        {
            throw new JsonException("Could not convert to hex string");
        }

        writer.WriteStringValue(characterBuffer[..byteCount]);
    }
}
