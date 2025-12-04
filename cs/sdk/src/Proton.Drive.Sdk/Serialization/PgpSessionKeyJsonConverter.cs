using System.Text.Json;
using System.Text.Json.Serialization;
using Proton.Cryptography.Pgp;

namespace Proton.Drive.Sdk.Serialization;

internal sealed class PgpSessionKeyJsonConverter : JsonConverter<PgpSessionKey>
{
    private const byte NonAeadVersion = 3;
    private const byte AeadVersion = 6;

    public override PgpSessionKey Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var bytes = reader.GetBytesFromBase64();
        var pkeskVersion = bytes[0];
        if (pkeskVersion == AeadVersion)
        {
            return PgpSessionKey.ImportForAead(bytes.AsSpan()[1..], SymmetricCipher.Aes256);
        }

        return PgpSessionKey.Import(bytes.AsSpan()[1..], SymmetricCipher.Aes256);
    }

    public override void Write(Utf8JsonWriter writer, PgpSessionKey value, JsonSerializerOptions options)
    {
        var pkeskVersion = value.IsAead() ? AeadVersion : NonAeadVersion;
        var token = value.Export();
        Span<byte> versionedValue = stackalloc byte[token.Length + 1];
        versionedValue[0] = pkeskVersion;
        token.CopyTo(versionedValue[1..]);

        writer.WriteBase64StringValue(versionedValue);
    }
}
