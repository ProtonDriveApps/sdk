using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Account.Addresses;

namespace Proton.Drive.Sdk.Account.Serialization;

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase, RespectRequiredConstructorParameters = true)]
[JsonSerializable(typeof(Address))]
internal sealed partial class AccountEntitiesSerializerContext : JsonSerializerContext;
