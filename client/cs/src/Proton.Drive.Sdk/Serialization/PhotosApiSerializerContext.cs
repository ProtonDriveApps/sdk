using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Photos;
using Proton.Sdk.Cryptography;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Serialization;

#pragma warning disable SA1114, SA1118 // Disable style analysis warnings due to attribute spanning multiple lines
[JsonSourceGenerationOptions(
#if DEBUG
    WriteIndented = true,
    RespectRequiredConstructorParameters = true,
#endif
    Converters =
    [
        typeof(PgpArmoredBlockJsonConverter<PgpArmoredMessage>),
        typeof(PgpArmoredBlockJsonConverter<PgpArmoredSignature>),
        typeof(PgpArmoredBlockJsonConverter<PgpArmoredSecretKey>),
        typeof(PgpArmoredBlockJsonConverter<PgpArmoredPublicKey>),
    ])]
#pragma warning restore SA1114, SA1118
[JsonSerializable(typeof(PhotosVolumeCreationRequest))]
[JsonSerializable(typeof(PhotosVolumeShareCreationParameters))]
[JsonSerializable(typeof(PhotosVolumeLinkCreationParameters))]
[JsonSerializable(typeof(TimelinePhotoListRequest))]
[JsonSerializable(typeof(TimelinePhotoListResponse))]
internal sealed partial class PhotosApiSerializerContext : JsonSerializerContext;
