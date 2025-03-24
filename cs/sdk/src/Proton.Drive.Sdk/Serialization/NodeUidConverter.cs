using System.Text.Json;
using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Nodes;

namespace Proton.Drive.Sdk.Serialization;

internal sealed class NodeUidConverter : JsonConverter<NodeUid>
{
    public override NodeUid Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        return NodeUid.TryParse(reader.GetString(), out var value) ? value : default;
    }

    public override void Write(Utf8JsonWriter writer, NodeUid value, JsonSerializerOptions options)
    {
        writer.WriteStringValue(value.ToString());
    }
}
