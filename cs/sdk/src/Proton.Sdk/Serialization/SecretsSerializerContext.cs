using System.Text.Json.Serialization;
using Proton.Cryptography.Pgp;

namespace Proton.Sdk.Serialization;

#pragma warning disable SA1114, SA1118 // Disable style analysis warnings due to attribute spanning multiple lines
[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    Converters =
    [
        typeof(PgpPrivateKeyJsonConverter),
    ])]
#pragma warning restore SA1114, SA1118
[JsonSerializable(typeof(IEnumerable<PgpPrivateKey>))]
[JsonSerializable(typeof(PgpPrivateKey[]))]
internal sealed partial class SecretsSerializerContext : JsonSerializerContext;
