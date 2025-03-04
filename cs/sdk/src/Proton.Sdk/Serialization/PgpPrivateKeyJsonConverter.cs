using System.Text.Json;
using System.Text.Json.Serialization;
using Proton.Cryptography.Pgp;

namespace Proton.Sdk.Serialization;

internal sealed class PgpPrivateKeyJsonConverter : JsonConverter<PgpPrivateKey>
{
    public override PgpPrivateKey Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var bytes = reader.GetBytesFromBase64();

        return PgpPrivateKey.Import(bytes);
    }

    public override void Write(Utf8JsonWriter writer, PgpPrivateKey value, JsonSerializerOptions options)
    {
        writer.WriteBase64StringValue(value.ToBytes());
    }
}
