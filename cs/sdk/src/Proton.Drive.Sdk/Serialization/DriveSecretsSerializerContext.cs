using System.Text.Json.Serialization;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Nodes;
using Proton.Sdk;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Serialization;

#pragma warning disable SA1114, SA1118 // Disable style analysis warnings due to attribute spanning multiple lines
[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    Converters =
    [
        typeof(PgpPrivateKeyJsonConverter),
        typeof(PgpSessionKeyJsonConverter),
        typeof(RefResultJsonConverter<FolderSecrets, DegradedFolderSecrets>),
        typeof(RefResultJsonConverter<FileSecrets, DegradedFileSecrets>),
    ])]
#pragma warning restore SA1114, SA1118
[JsonSerializable(typeof(IEnumerable<PgpPrivateKey>))]
[JsonSerializable(typeof(Result<FolderSecrets, DegradedFolderSecrets>?))]
[JsonSerializable(typeof(Result<FileSecrets, DegradedFileSecrets>?))]
[JsonSerializable(typeof(SerializableRefResult<FolderSecrets, DegradedFolderSecrets>))]
[JsonSerializable(typeof(SerializableRefResult<FileSecrets, DegradedFileSecrets>))]
internal sealed partial class DriveSecretsSerializerContext : JsonSerializerContext;
