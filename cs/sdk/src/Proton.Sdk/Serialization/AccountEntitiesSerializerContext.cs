using System.Text.Json.Serialization;
using Proton.Sdk.Addresses;

namespace Proton.Sdk.Serialization;

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(Address))]
internal sealed partial class AccountEntitiesSerializerContext : JsonSerializerContext;
