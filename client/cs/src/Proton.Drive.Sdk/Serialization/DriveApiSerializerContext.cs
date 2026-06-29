using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api;
using Proton.Drive.Sdk.Api.Devices;
using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Api.Folders;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Api.Volumes;
using Proton.Drive.Sdk.Api.Volumes.Events;
using Proton.Sdk.Api;
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
[JsonSerializable(typeof(ApiResponse))]
[JsonSerializable(typeof(VolumeCreationRequest))]
[JsonSerializable(typeof(VolumeCreationResponse))]
[JsonSerializable(typeof(VolumeResponse))]
[JsonSerializable(typeof(LinkDetailsRequest))]
[JsonSerializable(typeof(LinkDetailsResponse))]
[JsonSerializable(typeof(ExtendedAttributes))]
[JsonSerializable(typeof(ShareResponse))]
[JsonSerializable(typeof(ShareListResponse))]
[JsonSerializable(typeof(ShareResponseV2))]
[JsonSerializable(typeof(ContextShareResponse))]
[JsonSerializable(typeof(FolderChildrenResponse))]
[JsonSerializable(typeof(FolderCreationRequest))]
[JsonSerializable(typeof(FolderCreationResponse))]
[JsonSerializable(typeof(FileCreationRequest))]
[JsonSerializable(typeof(FileCreationResponse))]
[JsonSerializable(typeof(NodeNameAvailabilityRequest))]
[JsonSerializable(typeof(NodeNameAvailabilityResponse))]
[JsonSerializable(typeof(RevisionCreationRequest))]
[JsonSerializable(typeof(RevisionCreationResponse))]
[JsonSerializable(typeof(RevisionErrorResponse))]
[JsonSerializable(typeof(RevisionConflict))]
[JsonSerializable(typeof(BlockUploadPreparationRequest))]
[JsonSerializable(typeof(BlockUploadPreparationResponse))]
[JsonSerializable(typeof(RevisionUpdateRequest))]
[JsonSerializable(typeof(BlockVerificationInputResponse))]
[JsonSerializable(typeof(RevisionResponse))]
[JsonSerializable(typeof(ThumbnailBlockListRequest))]
[JsonSerializable(typeof(ThumbnailBlockListResponse))]
[JsonSerializable(typeof(ThumbnailBlockError))]
[JsonSerializable(typeof(MoveSingleLinkRequest))]
[JsonSerializable(typeof(MoveMultipleLinksRequest))]
[JsonSerializable(typeof(RenameLinkRequest))]
[JsonSerializable(typeof(MultipleLinksNullaryRequest))]
[JsonSerializable(typeof(AggregateApiResponse<LinkIdResponsePair>))]
[JsonSerializable(typeof(DeviceListResponse))]
[JsonSerializable(typeof(DeviceCreationRequest))]
[JsonSerializable(typeof(DeviceCreationResponse))]
[JsonSerializable(typeof(DeviceUpdateRequest))]
[JsonSerializable(typeof(VolumeTrashResponse))]
[JsonSerializable(typeof(VolumeLatestEventResponse))]
[JsonSerializable(typeof(VolumeEventListResponse))]
internal sealed partial class DriveApiSerializerContext : JsonSerializerContext;
