using Microsoft.Extensions.Logging;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Account.Addresses;
using Proton.Drive.Sdk.Api.Files;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Nodes.Upload;

internal sealed partial class RevisionUploadBackendFactory(ProtonDriveClient client)
{
    private const long SmallUploadSizeLimit = 128 * 1024;
    private const float SmallUploadEncryptionOverhead = 1.1f;

    public async ValueTask<IRevisionUploadBackend> GetBackendForAsync(
        NewFileUploadBackendRequest request,
        bool allowSmallUpload,
        CancellationToken cancellationToken)
    {
        if (allowSmallUpload
            && await CanUseSmallUploadAsync(
                request.IntendedUploadSize,
                request.Thumbnails,
                request.ContentCanSeek,
                cancellationToken).ConfigureAwait(false))
        {
            return CreateSmallNewFileBackend(request);
        }

        return await GetRegularBackendForAsync(request, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<IRevisionUploadBackend> GetBackendForAsync(
        NewRevisionUploadBackendRequest request,
        bool allowSmallUpload,
        CancellationToken cancellationToken)
    {
        if (allowSmallUpload
            && await CanUseSmallUploadAsync(
                request.IntendedUploadSize,
                request.Thumbnails,
                request.ContentCanSeek,
                cancellationToken).ConfigureAwait(false)
            && await TryGetContentKeyPacketAsync(request.FileUid, cancellationToken).ConfigureAwait(false) is { } contentKeyPacket)
        {
            return CreateSmallRevisionBackend(request, contentKeyPacket);
        }

        return await GetRegularBackendForAsync(request, cancellationToken).ConfigureAwait(false);
    }

    [LoggerMessage(
        Level = LogLevel.Warning,
        Message = "Could not get content key packet for file \"{FileUid}\" ({Error}); falling back to regular upload")]
    private static partial void LogContentKeyPacketUnavailable(ILogger logger, NodeUid fileUid, string? error);

    private static long GetTotalPlaintextSize(long intendedUploadSize, IReadOnlyList<Thumbnail> thumbnails)
    {
        var totalPlaintextSize = intendedUploadSize;
        foreach (var thumbnail in thumbnails)
        {
            totalPlaintextSize = checked(totalPlaintextSize + thumbnail.Content.Length);
        }

        return totalPlaintextSize;
    }

    private async ValueTask<ReadOnlyMemory<byte>?> TryGetContentKeyPacketAsync(NodeUid fileUid, CancellationToken cancellationToken)
    {
        try
        {
            var response = await client.Api.Links.GetDetailsAsync(fileUid.VolumeId, [fileUid.LinkId], cancellationToken).ConfigureAwait(false);
            var contentKeyPacket = response.Links.FirstOrDefault()?.File?.ContentKeyPacket;
            if (contentKeyPacket is null)
            {
                LogContentKeyPacketUnavailable(
                    client.Telemetry.GetLogger("Small revision upload backend"), fileUid, error: "Failed to get content key packet");
            }

            return contentKeyPacket;
        }
        catch (Exception e) when (e is ProtonApiException or HttpRequestException or TooManyRequestsException)
        {
            cancellationToken.ThrowIfCancellationRequested();
            LogContentKeyPacketUnavailable(
                client.Telemetry.GetLogger("Small revision upload backend"), fileUid, error: e.GetType().Name);
            return null;
        }
    }

    private async ValueTask<IRevisionUploadBackend> GetRegularBackendForAsync(
        NewFileUploadBackendRequest request,
        CancellationToken cancellationToken)
    {
        var revisionUid = await request.CreateDraftAsync(request.FileCreationRequest, request.FileSecrets, cancellationToken).ConfigureAwait(false);
        return await CreateRegularBackendAsync(
            revisionUid,
            request.FileKey,
            request.ContentKey,
            request.SigningKey,
            request.MembershipAddress,
            ct => request.DeleteDraftAsync(revisionUid, ct),
            cancellationToken).ConfigureAwait(false);
    }

    private async ValueTask<IRevisionUploadBackend> GetRegularBackendForAsync(
        NewRevisionUploadBackendRequest request,
        CancellationToken cancellationToken)
    {
        var draftRevisionUid = await request.CreateDraftAsync(request.RevisionCreationRequest, cancellationToken).ConfigureAwait(false);
        return await CreateRegularBackendAsync(
            draftRevisionUid,
            request.FileKey,
            request.ContentKey,
            request.SigningKey,
            request.MembershipAddress,
            ct => request.DeleteDraftAsync(draftRevisionUid, ct),
            cancellationToken).ConfigureAwait(false);
    }

    private async ValueTask<bool> CanUseSmallUploadAsync(
        long intendedUploadSize,
        IReadOnlyList<Thumbnail> thumbnails,
        bool contentCanSeek,
        CancellationToken cancellationToken)
    {
        if (!contentCanSeek || intendedUploadSize > client.TargetBlockSize)
        {
            return false;
        }

        return GetTotalPlaintextSize(intendedUploadSize, thumbnails) * SmallUploadEncryptionOverhead < SmallUploadSizeLimit
            && await client.FeatureFlagProvider.IsEnabledAsync(FeatureFlags.DriveSmallFileUpload, cancellationToken).ConfigureAwait(false);
    }

    private SmallRevisionUploadBackend CreateSmallNewFileBackend(NewFileUploadBackendRequest request) =>
        SmallRevisionUploadBackend.ForNewFile(
            client,
            request.FileKey,
            request.ContentKey,
            request.SigningKey,
            request.ParentVolumeId,
            request.FileCreationRequest,
            request.FileSecrets,
            client.Telemetry.GetLogger("Small revision upload backend"));

    private SmallRevisionUploadBackend CreateSmallRevisionBackend(
        NewRevisionUploadBackendRequest request,
        ReadOnlyMemory<byte> contentKeyPacket) =>
        SmallRevisionUploadBackend.ForRevision(
            client,
            new RevisionUid(request.FileUid, request.CurrentRevisionId),
            request.FileKey,
            request.ContentKey,
            request.SigningKey,
            contentKeyPacket,
            client.Telemetry.GetLogger("Small revision upload backend"));

    private async ValueTask<IRevisionUploadBackend> CreateRegularBackendAsync(
        RevisionUid revisionUid,
        PgpPrivateKey fileKey,
        PgpSessionKey contentKey,
        PgpPrivateKey signingKey,
        Address membershipAddress,
        Func<CancellationToken, ValueTask> deleteDraftFunction,
        CancellationToken cancellationToken)
    {
        var blockVerifier = await client.BlockVerifierFactory.CreateAsync(revisionUid, fileKey, cancellationToken).ConfigureAwait(false);

        return new RegularRevisionUploadBackend(
            client,
            revisionUid,
            fileKey,
            contentKey,
            signingKey,
            membershipAddress,
            blockVerifier,
            deleteDraftFunction,
            client.Telemetry.GetLogger("Regular revision upload backend"));
    }
}
