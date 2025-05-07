using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Api.Folders;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Api.Volumes;
using Proton.Drive.Sdk.Nodes;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Serialization;

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
[JsonSerializable(typeof(VolumeCreationParameters))]
[JsonSerializable(typeof(VolumeCreationResponse))]
[JsonSerializable(typeof(LinkDetailsRequest))]
[JsonSerializable(typeof(LinkDetailsResponse))]
[JsonSerializable(typeof(ExtendedAttributes))]
[JsonSerializable(typeof(ShareResponse))]
[JsonSerializable(typeof(ShareResponseV2))]
[JsonSerializable(typeof(ContextShareResponse))]
[JsonSerializable(typeof(FolderChildrenResponse))]
[JsonSerializable(typeof(FolderCreationParameters))]
[JsonSerializable(typeof(FolderCreationResponse))]
[JsonSerializable(typeof(FileCreationParameters))]
[JsonSerializable(typeof(FileCreationResponse))]
[JsonSerializable(typeof(RevisionConflictResponse))]
[JsonSerializable(typeof(BlockUploadRequestParameters))]
[JsonSerializable(typeof(BlockRequestResponse))]
[JsonSerializable(typeof(RevisionUpdateParameters))]
[JsonSerializable(typeof(BlockVerificationInputResponse))]
[JsonSerializable(typeof(RevisionResponse))]
internal sealed partial class DriveApiSerializerContext : JsonSerializerContext;
