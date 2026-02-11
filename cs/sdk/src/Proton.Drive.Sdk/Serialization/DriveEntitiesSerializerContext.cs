using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Caching;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Shares;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Serialization;

#pragma warning disable SA1114, SA1118 // Disable style analysis warnings due to attribute spanning multiple lines
[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    PropertyNameCaseInsensitive = true,
    Converters =
    [
        typeof(RefResultJsonConverter<string, InvalidNameError>),
        typeof(ValResultJsonConverter<Author, SignatureVerificationError>),
        typeof(RefResultJsonConverter<Node, DegradedNode>),
    ])]
#pragma warning restore SA1114, SA1118
[JsonSerializable(typeof(Share))]
[JsonSerializable(typeof(FolderNode))]
[JsonSerializable(typeof(CachedNodeInfo))]
[JsonSerializable(typeof(SerializableRefResult<string, string>))]
[JsonSerializable(typeof(SerializableValResult<Author, SignatureVerificationError>))]
[JsonSerializable(typeof(SerializableRefResult<Node, DegradedNode>))]
internal sealed partial class DriveEntitiesSerializerContext : JsonSerializerContext;
