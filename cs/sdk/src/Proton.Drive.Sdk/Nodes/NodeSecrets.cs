using System.Text.Json.Serialization;
using Proton.Cryptography.Pgp;

namespace Proton.Drive.Sdk.Nodes;

internal class NodeSecrets
{
    public PgpPrivateKey? Key { get; init; }
    public PgpSessionKey? PassphraseSessionKey { get; init; }
    public PgpSessionKey? NameSessionKey { get; init; }

    [JsonPropertyName("passphrase")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public ReadOnlyMemory<byte>? PassphraseForAnonymousMove { get; set; }
}
