using System.Text.Json;
using System.Text.Json.Serialization;
using Proton.Cryptography.Pgp;

namespace Proton.Drive.Sdk.Serialization;

internal sealed class PgpSessionKeyJsonConverter : JsonConverter<PgpSessionKey>
{
    public override PgpSessionKey Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var bytes = reader.GetBytesFromBase64();

        return PgpSessionKey.Import(bytes, SymmetricCipher.Aes256);
    }

    public override void Write(Utf8JsonWriter writer, PgpSessionKey value, JsonSerializerOptions options)
    {
        writer.WriteBase64StringValue(value.Export().Token);
    }
}
