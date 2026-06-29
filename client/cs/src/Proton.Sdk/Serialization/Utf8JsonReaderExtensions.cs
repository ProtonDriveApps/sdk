using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;

namespace Proton.Sdk.Serialization;

public static class Utf8JsonReaderExtensions
{
    extension(ref Utf8JsonReader reader)
    {
        public bool HasUnescapedValueSpan => !reader.HasValueSequence && !reader.ValueIsEscaped;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public int GetValueMaxCharacterCount()
        {
            return Encoding.UTF8.GetMaxCharCount(reader.GetValueLength());
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public int GetValueLength()
        {
            return reader.HasValueSequence ? checked((int)reader.ValueSequence.Length) : reader.ValueSpan.Length;
        }
    }
}
