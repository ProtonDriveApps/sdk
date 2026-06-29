using System.Text.Json.Serialization;

namespace Proton.Sdk.Api;

[JsonSerializable(typeof(ApiResponse))]
internal sealed partial class ApiSerializerContext : JsonSerializerContext;
