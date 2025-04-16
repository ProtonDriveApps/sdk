using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Shares;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Serialization;

#pragma warning disable SA1114, SA1118 // Disable style analysis warnings due to attribute spanning multiple lines
[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    Converters =
    [
        typeof(ResultJsonConverter<string, InvalidNameError>),
        typeof(ResultJsonConverter<Author, SignatureVerificationError>),
        typeof(ResultJsonConverter<Node, DegradedNode>),
    ])]
#pragma warning restore SA1114, SA1118
[JsonSerializable(typeof(Share))]
[JsonSerializable(typeof(FolderNode))]
[JsonSerializable(typeof(CachedNodeInfo))]
[JsonSerializable(typeof(SerializableResult<string, string>))]
[JsonSerializable(typeof(SerializableResult<Author, SignatureVerificationError>))]
[JsonSerializable(typeof(SerializableResult<Node, DegradedNode>))]
internal sealed partial class DriveEntitiesSerializerContext : JsonSerializerContext;
