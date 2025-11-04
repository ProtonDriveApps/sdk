using Microsoft.Extensions.Logging;
using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Nodes.Download;
using Proton.Drive.Sdk.Nodes.Upload;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal static partial class RevisionOperations
{
    public static async ValueTask<(RevisionUid RevisionUid, FileSecrets FileSecrets)> CreateDraftAsync(
        ProtonDriveClient client,
        NodeUid fileUid,
        RevisionId lastKnownRevisionId,
        CancellationToken cancellationToken)
    {
        var parameters = new RevisionCreationRequest
        {
            CurrentRevisionId = lastKnownRevisionId,
            ClientId = client.Uid,
        };

        var fileSecrets = await FileOperations.GetSecretsAsync(client, fileUid, cancellationToken).ConfigureAwait(false);

        RevisionId revisionId;
        try
        {
            var revisionResponse = await client.Api.Files.CreateRevisionAsync(fileUid.VolumeId, fileUid.LinkId, parameters, cancellationToken)
                .ConfigureAwait(false);

            revisionId = revisionResponse.Identity.RevisionId;
        }
        catch (ProtonApiException<RevisionConflictResponse> e)
            when (e.Response is { Conflict.DraftRevisionId: { } draftRevisionId }
                && (e.Response.Conflict.DraftClientUid == client.Uid))
        {
            revisionId = draftRevisionId;
        }
        catch (ProtonApiException<RevisionConflictResponse> e)
        {
            throw new RevisionDraftConflictException(e);
        }

        return (new RevisionUid(fileUid, revisionId), fileSecrets);
    }

    public static async ValueTask<RevisionWriter> OpenForWritingAsync(
        ProtonDriveClient client,
        RevisionUid revisionUid,
        FileSecrets fileSecrets,
        Action<int> releaseBlocksAction,
        CancellationToken cancellationToken)
    {
        var membershipAddress = await NodeOperations.GetMembershipAddressAsync(client, revisionUid.NodeUid, cancellationToken).ConfigureAwait(false);
        var signingKey = await client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, cancellationToken).ConfigureAwait(false);

        LogEnteringFileUploadSemaphore(client.Logger, revisionUid);
        await client.BlockUploader.FileSemaphore.WaitAsync(cancellationToken).ConfigureAwait(false);
        LogEnteredFileUploadSemaphore(client.Logger, revisionUid);

        return new RevisionWriter(
            client,
            revisionUid,
            fileSecrets.Key,
            fileSecrets.ContentKey,
            signingKey,
            membershipAddress,
            releaseBlocksAction,
            () =>
            {
                var previousCount = client.BlockUploader.FileSemaphore.Release();
                LogReleasedFileUploadSemaphore(client.Logger, revisionUid, previousCount);
            },
            client.TargetBlockSize,
            client.MaxBlockSize);
    }

    internal static async ValueTask<RevisionReader> OpenForReadingAsync(
        ProtonDriveClient client,
        RevisionUid revisionUid,
        Action<int> releaseBlockListingAction,
        CancellationToken cancellationToken)
    {
        var fileSecrets = await FileOperations.GetSecretsAsync(client, revisionUid.NodeUid, cancellationToken).ConfigureAwait(false);

        var (fileUid, revisionId) = revisionUid;

        var revisionResponse = await client.Api.Files.GetRevisionAsync(
            fileUid.VolumeId,
            fileUid.LinkId,
            revisionId,
            RevisionReader.MinBlockIndex,
            RevisionReader.DefaultBlockPageSize,
            withoutBlockUrls: false,
            cancellationToken).ConfigureAwait(false);

        LogEnteringFileDownloadSemaphore(client.Logger, revisionUid);
        await client.BlockDownloader.FileSemaphore.WaitAsync(cancellationToken).ConfigureAwait(false);
        LogEnteredFileDownloadSemaphore(client.Logger, revisionUid);

        return new RevisionReader(
            client,
            revisionUid,
            fileSecrets.Key,
            fileSecrets.ContentKey,
            revisionResponse.Revision,
            releaseBlockListingAction,
            () =>
            {
                var previousCount = client.BlockDownloader.FileSemaphore.Release();
                LogReleasedFileDownloadSemaphore(client.Logger, revisionUid, previousCount);
            });
    }

    [LoggerMessage(Level = LogLevel.Trace, Message = "Trying to enter file upload semaphore for revision {RevisionUid}")]
    private static partial void LogEnteringFileUploadSemaphore(ILogger logger, RevisionUid revisionUid);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Entered file upload semaphore for revision {RevisionUid}")]
    private static partial void LogEnteredFileUploadSemaphore(ILogger logger, RevisionUid revisionUid);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Releasing file upload semaphore for revision {RevisionUid}, previous count = {PreviousCount}")]
    private static partial void LogReleasedFileUploadSemaphore(ILogger logger, RevisionUid revisionUid, int previousCount);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Trying to enter file download semaphore for revision {RevisionUid}")]
    private static partial void LogEnteringFileDownloadSemaphore(ILogger logger, RevisionUid revisionUid);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Entered file download semaphore for revision {RevisionUid}")]
    private static partial void LogEnteredFileDownloadSemaphore(ILogger logger, RevisionUid revisionUid);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Releasing file download semaphore for revision {RevisionUid}, previous count = {PreviousCount}")]
    private static partial void LogReleasedFileDownloadSemaphore(ILogger logger, RevisionUid revisionUid, int previousCount);
}
