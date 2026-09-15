using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Account.Addresses;
using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Nodes.Upload;

internal sealed record NewFileUploadBackendRequest(
    long IntendedUploadSize,
    IEnumerable<Thumbnail> Thumbnails,
    bool ContentCanSeek,
    VolumeId ParentVolumeId,
    FileCreationRequest FileCreationRequest,
    FileOperationData FileSecrets,
    PgpPrivateKey FileKey,
    PgpSessionKey ContentKey,
    PgpPrivateKey SigningKey,
    Address MembershipAddress,
    Func<FileCreationRequest, FileOperationData, CancellationToken, ValueTask<RevisionUid>> CreateDraftAsync,
    Func<RevisionUid, CancellationToken, ValueTask> DeleteDraftAsync);
