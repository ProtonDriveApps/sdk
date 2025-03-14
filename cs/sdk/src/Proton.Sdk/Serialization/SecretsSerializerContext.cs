using System.Text.Json.Serialization;
using Proton.Cryptography.Pgp;

namespace Proton.Sdk.Serialization;

[JsonSourceGenerationOptions(
    Converters =
    [
        typeof(PgpPrivateKeyJsonConverter),
    ])]
[JsonSerializable(typeof(IEnumerable<PgpPrivateKey>))]
[JsonSerializable(typeof(PgpPrivateKey[]))]
internal sealed partial class SecretsSerializerContext : JsonSerializerContext;
