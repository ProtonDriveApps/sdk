using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Addresses;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Serialization;

[JsonSourceGenerationOptions(
    Converters =
    [
        typeof(StrongIdJsonConverter<AddressId>),
        typeof(StrongIdJsonConverter<VolumeId>),
        typeof(StrongIdJsonConverter<ShareId>),
        typeof(StrongIdJsonConverter<LinkId>),
    ])]
[JsonSerializable(typeof(Volume[]))]
internal partial class DriveEntitySerializerContext : JsonSerializerContext;
