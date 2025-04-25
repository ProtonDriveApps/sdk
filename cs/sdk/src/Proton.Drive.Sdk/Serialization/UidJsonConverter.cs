using System.Text.Json;
using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Serialization;

internal sealed class UidJsonConverter<TUid> : JsonConverter<TUid>
    where TUid : struct, ICompositeUid<TUid>
{
    public override TUid Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        return ICompositeUid<TUid>.TryParse(reader.GetString(), out var uid) ? uid.Value : default;
    }

    public override void Write(Utf8JsonWriter writer, TUid value, JsonSerializerOptions options)
    {
        writer.WriteStringValue(value.ToString());
    }
}
