using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using Proton.Drive.Sdk.Api;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Caching;
using Proton.Drive.Sdk.Http;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Nodes.Download;
using Proton.Drive.Sdk.Nodes.Upload;
using Proton.Drive.Sdk.Nodes.Upload.Verification;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;
using Proton.Sdk.Api;
using Proton.Sdk.Caching;
using Proton.Sdk.Configuration;
using Proton.Sdk.Telemetry;

namespace Proton.Drive.Sdk;

[Experimental("Photos")]
public sealed class ProtonPhotosClient
{
    // The types of shared items exposed by the Photos client.
    private static readonly ShareTargetType[] ShareTargetTypes =
        [ShareTargetType.Photo, ShareTargetType.Album];

    public ProtonPhotosClient(
        IHttpClientFactory httpClientFactory,
        IProtonAccountClient accountClient,
        ICacheRepository? cacheRepository,
        IFeatureFlagProvider featureFlagProvider,
        ITelemetry telemetry,
        ProtonDriveClientOptions? creationParameters = null)
    {
        var httpClientFactoryDecorator = new SdkHttpClientFactoryDecorator(httpClientFactory, creationParameters?.BindingsLanguage);
        var defaultApiHttpClient = httpClientFactoryDecorator.CreateClientWithTimeout(
            creationParameters?.DefaultApiTimeoutSecondsOverride ?? ProtonApiDefaults.DefaultTimeoutSeconds);
        var storageApiHttpClient = httpClientFactoryDecorator.CreateClientWithTimeout(
            creationParameters?.StorageApiTimeoutSecondsOverride ?? ProtonDriveDefaults.StorageApiTimeoutSeconds);
        var api = new DriveApiClients(defaultApiHttpClient, storageApiHttpClient);

        DriveClient = new ProtonDriveClient(
            accountClient,
            api,
            new PhotosNodeProvider(api),
            new DriveCache(cacheRepository),
            new BlockVerifierFactory(defaultApiHttpClient),
            featureFlagProvider,
            telemetry,
            creationParameters?.Uid,
            creationParameters?.DegreeOfBlockTransferParallelismOverride);
    }

    internal ProtonDriveClient DriveClient { get; }

    [Experimental("TryTransferQueuing")]
    public async ValueTask<FileUploader?> TryGetFileUploaderAsync(
        string name,
        string mediaType,
        long size,
        PhotosFileUploadMetadata metadata,
        bool overrideExistingDraftByOtherClient,
        CancellationToken cancellationToken)
    {
        var photosRoot = await PhotosNodeOperations.GetOrCreatePhotosFolderAsync(DriveClient, cancellationToken).ConfigureAwait(false);

        var draftProvider = new NewFileDraftProvider(DriveClient, photosRoot.Uid, name, mediaType, overrideExistingDraftByOtherClient);

        return FileUploader.TryCreate(DriveClient, draftProvider, photosRoot.Uid, size, metadata);
    }

    public async ValueTask<FileUploader> GetFileUploaderAsync(
        string name,
        string mediaType,
        long size,
        PhotosFileUploadMetadata metadata,
        bool overrideExistingDraftByOtherClient,
        CancellationToken cancellationToken)
    {
        var photosRoot = await PhotosNodeOperations.GetOrCreatePhotosFolderAsync(DriveClient, cancellationToken).ConfigureAwait(false);

        var draftProvider = new NewFileDraftProvider(DriveClient, photosRoot.Uid, name, mediaType, overrideExistingDraftByOtherClient);

        return await GetFileUploaderAsync(draftProvider, photosRoot.Uid, size, metadata, cancellationToken).ConfigureAwait(false);
    }

    public ValueTask<IReadOnlyList<string>> FindDuplicatesAsync(
        string name,
        Func<CancellationToken, ValueTask<ReadOnlyMemory<byte>>> computeContentSha1,
        CancellationToken cancellationToken)
    {
        return PhotoOperations.FindDuplicatesAsync(DriveClient, name, computeContentSha1, cancellationToken);
    }

    public ValueTask<Node?> GetNodeAsync(NodeUid nodeUid, CancellationToken cancellationToken)
    {
        return NodeOperations
            .EnumerateNodesAsync(DriveClient, nodeUid.VolumeId, [nodeUid.LinkId], cancellationToken)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public IAsyncEnumerable<Node> EnumerateNodesAsync(IAsyncEnumerable<NodeUid> nodeUids, CancellationToken cancellationToken = default)
    {
        return NodeOperations.EnumerateNodesAsync(DriveClient, nodeUids, cancellationToken);
    }

    public IAsyncEnumerable<PhotosTimelineItem> EnumerateTimelineAsync(CancellationToken cancellationToken)
    {
        return PhotosNodeOperations.EnumeratePhotosTimelineAsync(DriveClient, cancellationToken);
    }

    public IAsyncEnumerable<NodeUid> EnumerateAlbumNodeUidsAsync(CancellationToken cancellationToken)
    {
        return PhotosNodeOperations.EnumerateAlbumNodeUidsAsync(DriveClient, cancellationToken);
    }

    public IAsyncEnumerable<AlbumItem> EnumerateAlbumAsync(NodeUid albumUid, CancellationToken cancellationToken)
    {
        return PhotosNodeOperations.EnumerateAlbumAsync(DriveClient, albumUid, cancellationToken);
    }

    [Experimental("TryTransferQueuing")]
    public PhotosFileDownloader? TryGetPhotosDownloader(NodeUid photoUid)
    {
        return PhotosFileDownloader.TryCreate(this, photoUid);
    }

    public async ValueTask<PhotosFileDownloader> GetPhotosDownloaderAsync(NodeUid photoUid, CancellationToken cancellationToken)
    {
        return await PhotosFileDownloader.CreateAsync(this, photoUid, cancellationToken).ConfigureAwait(false);
    }

    public IAsyncEnumerable<FileThumbnail> EnumerateThumbnailsAsync(
        IEnumerable<NodeUid> photoUids,
        ThumbnailType thumbnailType = ThumbnailType.Thumbnail,
        CancellationToken cancellationToken = default)
    {
        return FileOperations.EnumerateThumbnailsAsync(DriveClient, photoUids, thumbnailType, cancellationToken);
    }

    public IAsyncEnumerable<NodeUid> EnumerateSharedNodeUidsAsync(CancellationToken cancellationToken = default)
    {
        return Shares.SharingOperations.EnumerateSharedNodeUidsAsync(
            DriveClient,
            VolumeOperations.TryGetPhotosVolumeIdAsync,
            cancellationToken);
    }

    public IAsyncEnumerable<NodeUid> EnumerateSharedWithMeNodeUidsAsync(CancellationToken cancellationToken = default)
    {
        return EnumerateSharedWithMeNodeUidsAsync(DriveClient, cancellationToken);
    }

    public ValueTask LeaveSharedNodeAsync(NodeUid nodeUid, CancellationToken cancellationToken)
    {
        return Shares.SharingOperations.LeaveSharedNodeAsync(DriveClient, nodeUid, cancellationToken);
    }

    public ValueTask<IReadOnlyDictionary<NodeUid, Result<Exception>>> TrashNodesAsync(IEnumerable<NodeUid> uids, CancellationToken cancellationToken)
    {
        return NodeOperations.TrashAsync(DriveClient, uids, cancellationToken);
    }

    public ValueTask<IReadOnlyDictionary<NodeUid, Result<Exception>>> DeleteNodesAsync(IEnumerable<NodeUid> uids, CancellationToken cancellationToken)
    {
        return NodeOperations.DeleteFromTrashAsync(DriveClient, uids, cancellationToken);
    }

    public ValueTask<IReadOnlyDictionary<NodeUid, Result<Exception>>> RestoreNodesAsync(IEnumerable<NodeUid> uids, CancellationToken cancellationToken)
    {
        return NodeOperations.RestoreFromTrashAsync(DriveClient, uids, cancellationToken);
    }

    public async IAsyncEnumerable<NodeUid> EnumerateTrashNodeUidsAsync([EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var volumeId = await VolumeOperations.TryGetPhotosVolumeIdAsync(DriveClient, cancellationToken).ConfigureAwait(false);

        if (volumeId is null)
        {
            // Nothing to enumerate if the main volume doesn't exist
            yield break;
        }

        await foreach (var item in VolumeOperations.EnumerateTrashAsync(DriveClient, volumeId.Value, cancellationToken).ConfigureAwait(false))
        {
            yield return item;
        }
    }

    public async ValueTask EmptyTrashAsync(CancellationToken cancellationToken)
    {
        var volumeId = await VolumeOperations.TryGetPhotosVolumeIdAsync(DriveClient, cancellationToken).ConfigureAwait(false);

        if (volumeId is null)
        {
            // Nothing to do if the photos volume doesn't exist
            return;
        }

        await VolumeOperations.EmptyTrashAsync(DriveClient, volumeId.Value, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>Adds and removes tags (including favorite) on the given photos.</summary>
    /// <remarks>
    /// Shared photos are not yet supported. Favoriting a photo that lives outside the user's own photos volume
    /// requires re-encrypting the photo and its related photos for the target, which is not implemented; such updates
    /// fail with a <see cref="NotSupportedException"/> in the returned results. Related photos (e.g. Live Photo or burst
    /// siblings) are likewise not handled yet.
    /// </remarks>
    public ValueTask<IReadOnlyDictionary<NodeUid, Result<Exception>>> UpdatePhotosAsync(
        IReadOnlyList<PhotoTagsUpdate> updates,
        CancellationToken cancellationToken)
    {
        return PhotoOperations.UpdatePhotosAsync(DriveClient, updates, cancellationToken);
    }

    internal ValueTask<FolderNode> GetPhotosRootAsync(CancellationToken cancellationToken)
    {
        return PhotosNodeOperations.GetOrCreatePhotosFolderAsync(DriveClient, cancellationToken);
    }

    private static async IAsyncEnumerable<NodeUid> EnumerateSharedWithMeNodeUidsAsync(
        ProtonDriveClient client,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        await foreach (var nodeUid in Shares.SharingOperations.EnumerateSharedWithMeNodeUidsAsync(client, ShareTargetTypes, cancellationToken)
            .ConfigureAwait(false))
        {
            yield return nodeUid;
        }

        // Shared albums are not (yet) returned by the shared-with-me endpoint, so they are
        // enumerated from a dedicated endpoint. Mirrors the JS sharing apiService.
        await foreach (var albumUid in PhotoOperations.EnumerateSharedWithMeAlbumUidsAsync(client, cancellationToken).ConfigureAwait(false))
        {
            yield return albumUid;
        }
    }

    private async ValueTask<FileUploader> GetFileUploaderAsync(
        IRevisionDraftProvider revisionDraftProvider,
        NodeUid telemetryContextNodeUid,
        long size,
        PhotosFileUploadMetadata metadata,
        CancellationToken cancellationToken)
    {
        return await FileUploader.CreateAsync(
            DriveClient,
            revisionDraftProvider,
            telemetryContextNodeUid,
            size,
            metadata,
            cancellationToken).ConfigureAwait(false);
    }
}
