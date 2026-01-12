using System.Text.Json.Serialization;
using Proton.Photos.Sdk.Api;
using Proton.Photos.Sdk.Api.Photos;
using Proton.Sdk.Serialization;

namespace Proton.Photos.Sdk.Serialization;

#pragma warning disable SA1114, SA1118 // Disable style analysis warnings due to attribute spanning multiple lines
[JsonSourceGenerationOptions(
#if DEBUG
    WriteIndented = true,
#endif
    Converters =
    [
        typeof(PgpArmoredMessageJsonConverter),
        typeof(PgpArmoredSignatureJsonConverter),
        typeof(PgpArmoredPrivateKeyJsonConverter),
        typeof(PgpArmoredPublicKeyJsonConverter),
    ])]
#pragma warning restore SA1114, SA1118
[JsonSerializable(typeof(PhotosVolumeCreationRequest))]
[JsonSerializable(typeof(PhotosVolumeShareCreationParameters))]
[JsonSerializable(typeof(PhotosVolumeLinkCreationParameters))]
[JsonSerializable(typeof(TimelinePhotoListRequest))]
[JsonSerializable(typeof(TimelinePhotoListResponse))]
[JsonSerializable(typeof(PhotoDetailsResponse))]
internal sealed partial class PhotosApiSerializerContext : JsonSerializerContext;
