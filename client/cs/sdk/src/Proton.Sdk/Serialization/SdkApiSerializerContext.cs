using System.Text.Json.Serialization;
using Proton.Sdk.Api;

namespace Proton.Sdk.Serialization;

[JsonSerializable(typeof(ApiResponse))]
public sealed partial class SdkApiSerializerContext : JsonSerializerContext;
