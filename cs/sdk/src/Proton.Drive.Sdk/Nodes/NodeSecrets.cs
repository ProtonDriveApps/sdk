using System.Text.Json.Serialization;
using Proton.Cryptography.Pgp;

namespace Proton.Drive.Sdk.Nodes;

internal class NodeSecrets
{
    public required PgpPrivateKey Key { get; init; }
    public required PgpSessionKey PassphraseSessionKey { get; init; }
    public required PgpSessionKey NameSessionKey { get; init; }

    [JsonPropertyName("passphrase")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public ReadOnlyMemory<byte>? PassphraseForAnonymousMove { get; set; }
}
