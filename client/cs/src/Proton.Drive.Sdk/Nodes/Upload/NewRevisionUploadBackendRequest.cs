using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Account.Addresses;
using Proton.Drive.Sdk.Api.Files;

namespace Proton.Drive.Sdk.Nodes.Upload;

internal sealed record NewRevisionUploadBackendRequest(
    long IntendedUploadSize,
    IEnumerable<Thumbnail> Thumbnails,
    bool ContentCanSeek,
    NodeUid FileUid,
    RevisionId CurrentRevisionId,
    RevisionCreationRequest RevisionCreationRequest,
    FileOperationData FileSecrets,
    PgpPrivateKey FileKey,
    PgpSessionKey ContentKey,
    PgpPrivateKey SigningKey,
    Address MembershipAddress,
    Func<RevisionCreationRequest, CancellationToken, ValueTask<RevisionUid>> CreateDraftAsync,
    Func<RevisionUid, CancellationToken, ValueTask> DeleteDraftAsync);
