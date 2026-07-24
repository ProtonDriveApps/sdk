using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using Microsoft.IO;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Caching;
using Proton.Drive.Sdk.Cryptography;
using Proton.Drive.Sdk.Devices;
using Proton.Drive.Sdk.Events;
using Proton.Drive.Sdk.Http;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Nodes.Download;
using Proton.Drive.Sdk.Nodes.Upload;
using Proton.Drive.Sdk.Nodes.Upload.Verification;
using Proton.Drive.Sdk.Shares;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;
using Proton.Sdk.Api;
using Proton.Sdk.Caching;
using Proton.Sdk.Configuration;
using Proton.Sdk.Telemetry;

namespace Proton.Drive.Sdk;

public sealed class ProtonDriveClient
{
    private const int DefaultDegreeOfBlockTransferParallelism = 6;
    private const int MaxDegreeOfThumbnailDownloadParallelism = 8;

    // The types of shared items exposed by the Drive client.
    private static readonly ShareTargetType[] ShareTargetTypes =
        [ShareTargetType.Folder, ShareTargetType.File, ShareTargetType.ProtonVendor];

    public ProtonDriveClient(
        IHttpClientFactory httpClientFactory,
        IProtonAccountClient accountClient,
        ICacheRepository? cacheRepository,
        IFeatureFlagProvider featureFlagProvider,
        ITelemetry telemetry,
        ProtonDriveClientOptions? options = null)
        : this(CreationParameters.Create(httpClientFactory, accountClient, cacheRepository, featureFlagProvider, telemetry, options))
    {
    }

    internal ProtonDriveClient(
        IProtonAccountClient accountClient,
        IDriveApiClients api,
        INodeProvider nodeProvider,
        IDriveCache cache,
        IBlockVerifierFactory blockVerifierFactory,
        IFeatureFlagProvider featureFlagProvider,
        ITelemetry telemetry,
        string? uid = null,
        int? degreeOfBlockTransferParallelism = null)
    {
        Uid = uid ?? Guid.NewGuid().ToString();

        Account = accountClient;
        Api = api;
        Cache = cache;
        BlockVerifierFactory = blockVerifierFactory;
        Telemetry = telemetry;
        FeatureFlagProvider = featureFlagProvider;

        NodeProvider = nodeProvider;

        var maxDegreeOfBlockTransferParallelism = degreeOfBlockTransferParallelism ?? DefaultDegreeOfBlockTransferParallelism;

        DownloadQueue = new TransferQueue(maxDegreeOfBlockTransferParallelism, telemetry.GetLogger("Download queue"));
        UploadQueue = new TransferQueue(maxDegreeOfBlockTransferParallelism, telemetry.GetLogger("Upload queue"));
        ThumbnailDownloadQueue = new TransferQueue(MaxDegreeOfThumbnailDownloadParallelism, telemetry.GetLogger("Thumbnail download queue"));

        BlockDownloader = new BlockDownloader(this);
        ThumbnailBlockDownloader = new BlockDownloader(this);
        RevisionUploadBackendFactory = new RevisionUploadBackendFactory(this);

        PgpConfiguration.DefaultAeadStreamingChunkLength = PgpDefaults.AeadStreamingChunkLength;
    }

    private ProtonDriveClient(CreationParameters parameters)
        : this(
            parameters.AccountClient,
            parameters.Api,
            parameters.NodeProvider,
            parameters.Cache,
            parameters.BlockVerifierFactory,
            parameters.FeatureFlagProvider,
            parameters.Telemetry,
            parameters.Uid,
            parameters.DegreeOfBlockTransferParallelism)
    {
    }

    internal static RecyclableMemoryStreamManager MemoryStreamManager { get; } =
        new(new RecyclableMemoryStreamManager.Options { BlockSize = PgpDefaults.AeadDecryptionMinimumInputLength });

    internal string Uid { get; }

    internal IProtonAccountClient Account { get; }
    internal IDriveApiClients Api { get; }
    internal IDriveCache Cache { get; }
    internal IBlockVerifierFactory BlockVerifierFactory { get; }
    internal ITelemetry Telemetry { get; }
    internal IFeatureFlagProvider FeatureFlagProvider { get; }

    internal INodeProvider NodeProvider { get; }

    internal TransferQueue UploadQueue { get; }
    internal TransferQueue DownloadQueue { get; }
    internal TransferQueue ThumbnailDownloadQueue { get; }

    internal int TargetBlockSize { get; set; } = RevisionWriter.DefaultBlockSize;

    internal BlockDownloader BlockDownloader { get; }
    internal BlockDownloader ThumbnailBlockDownloader { get; }
    internal RevisionUploadBackendFactory RevisionUploadBackendFactory { get; }

    internal Func<string, IEnumerable<string>> GetAlternateFileNames { get; } = AlternateFileNameGenerator.GetNames;

    public ValueTask<FolderNode> GetMyFilesFolderAsync(CancellationToken cancellationToken)
    {
        return NodeOperations.GetOrCreateMyFilesFolderAsync(this, cancellationToken);
    }

    public ValueTask<Node?> GetNodeAsync(NodeUid nodeUid, CancellationToken cancellationToken)
    {
        return NodeOperations
            .EnumerateNodesAsync(this, nodeUid.VolumeId, [nodeUid.LinkId], cancellationToken)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public IAsyncEnumerable<Node> EnumerateNodesAsync(IAsyncEnumerable<NodeUid> nodeUids, CancellationToken cancellationToken = default)
    {
        return NodeOperations.EnumerateNodesAsync(this, nodeUids, cancellationToken);
    }

    public ValueTask<FolderNode> CreateFolderAsync(NodeUid parentId, string name, DateTime? lastModificationTime, CancellationToken cancellationToken)
    {
        return FolderOperations.CreateAsync(this, parentId, name, lastModificationTime, cancellationToken);
    }

    public IAsyncEnumerable<NodeUid> EnumerateFolderChildrenNodeUidsAsync(NodeUid folderId, CancellationToken cancellationToken = default)
    {
        return FolderOperations.EnumerateChildrenAsync(this, folderId, cancellationToken);
    }

    public IAsyncEnumerable<FileThumbnail> EnumerateThumbnailsAsync(
        IEnumerable<NodeUid> fileUids,
        ThumbnailType type,
        CancellationToken cancellationToken = default)
    {
        return FileOperations.EnumerateThumbnailsAsync(this, fileUids, type, cancellationToken);
    }

    [Experimental("TryTransferQueuing")]
    public FileUploader? TryGetFileUploader(
        NodeUid parentFolderUid,
        string name,
        string mediaType,
        long size,
        FileUploadMetadata metadata,
        bool overrideExistingDraftByOtherClient)
    {
        var draftProvider = new NewFileDraftProvider(this, parentFolderUid, name, mediaType, overrideExistingDraftByOtherClient);

        return FileUploader.TryCreate(this, draftProvider, parentFolderUid, size, metadata);
    }

    public async ValueTask<FileUploader> GetFileUploaderAsync(
        NodeUid parentFolderUid,
        string name,
        string mediaType,
        long size,
        FileUploadMetadata metadata,
        bool overrideExistingDraftByOtherClient,
        CancellationToken cancellationToken)
    {
        var draftProvider = new NewFileDraftProvider(this, parentFolderUid, name, mediaType, overrideExistingDraftByOtherClient);

        return await FileUploader.CreateAsync(this, draftProvider, parentFolderUid, size, metadata, cancellationToken).ConfigureAwait(false);
    }

    [Experimental("TryTransferQueuing")]
    public FileUploader? TryGetFileRevisionUploader(
        RevisionUid currentActiveRevisionUid,
        long size,
        FileUploadMetadata metadata)
    {
        var draftProvider = new NewRevisionDraftProvider(this, currentActiveRevisionUid.NodeUid, currentActiveRevisionUid.RevisionId);

        return FileUploader.TryCreate(this, draftProvider, currentActiveRevisionUid.NodeUid, size, metadata);
    }

    public async ValueTask<FileUploader> GetFileRevisionUploaderAsync(
        RevisionUid currentActiveRevisionUid,
        long size,
        FileUploadMetadata metadata,
        CancellationToken cancellationToken)
    {
        var draftProvider = new NewRevisionDraftProvider(this, currentActiveRevisionUid.NodeUid, currentActiveRevisionUid.RevisionId);

        return await FileUploader.CreateAsync(this, draftProvider, currentActiveRevisionUid.NodeUid, size, metadata, cancellationToken).ConfigureAwait(false);
    }

    [Experimental("TryTransferQueuing")]
    public FileDownloader? TryGetFileDownloader(RevisionUid revisionUid)
    {
        return FileDownloader.TryCreate(this, revisionUid);
    }

    public async ValueTask<FileDownloader> GetFileDownloaderAsync(RevisionUid revisionUid, CancellationToken cancellationToken)
    {
        return await FileDownloader.CreateAsync(this, revisionUid, cancellationToken).ConfigureAwait(false);
    }

    // FIXME: unit tests, including name collision cases
    public ValueTask<string> GetAvailableNameAsync(NodeUid parentUid, string name, CancellationToken cancellationToken)
    {
        return NodeOperations.GetAvailableNameAsync(this, parentUid, name, cancellationToken);
    }

    public async ValueTask<IReadOnlyDictionary<NodeUid, Result<Exception>>> MoveNodesAsync(
        IEnumerable<NodeUid> uids,
        NodeUid newParentFolderUid,
        CancellationToken cancellationToken)
    {
        // FIXME: finalize the implementation that uses the batch move endpoint, and use it instead of this naïve code
        var results = new Dictionary<NodeUid, Result<Exception>>();

        foreach (var uid in uids)
        {
            try
            {
                await NodeOperations.MoveSingleAsync(this, uid, newParentFolderUid, newName: null, cancellationToken).ConfigureAwait(false);
                results[uid] = Result<Exception>.Success;
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                results[uid] = exception;
            }
        }

        return results;
    }

    public ValueTask RenameNodeAsync(NodeUid uid, string newName, string? newMediaType, CancellationToken cancellationToken)
    {
        return NodeOperations.RenameAsync(this, uid, newName, newMediaType, cancellationToken);
    }

    public IAsyncEnumerable<NodeUid> EnumerateSharedNodeUidsAsync(CancellationToken cancellationToken = default)
    {
        return SharingOperations.EnumerateSharedNodeUidsAsync(this, VolumeOperations.TryGetMainVolumeIdAsync, cancellationToken);
    }

    public IAsyncEnumerable<NodeUid> EnumerateSharedWithMeNodeUidsAsync(CancellationToken cancellationToken = default)
    {
        return SharingOperations.EnumerateSharedWithMeNodeUidsAsync(this, ShareTargetTypes, cancellationToken);
    }

    public ValueTask LeaveSharedNodeAsync(NodeUid nodeUid, CancellationToken cancellationToken)
    {
        return SharingOperations.LeaveSharedNodeAsync(this, nodeUid, cancellationToken);
    }

    public ValueTask<IReadOnlyDictionary<NodeUid, Result<Exception>>> TrashNodesAsync(IEnumerable<NodeUid> uids, CancellationToken cancellationToken)
    {
        return NodeOperations.TrashAsync(this, uids, cancellationToken);
    }

    public ValueTask<IReadOnlyDictionary<NodeUid, Result<Exception>>> DeleteNodesAsync(IEnumerable<NodeUid> uids, CancellationToken cancellationToken)
    {
        return NodeOperations.DeleteFromTrashAsync(this, uids, cancellationToken);
    }

    public ValueTask<IReadOnlyDictionary<NodeUid, Result<Exception>>> RestoreNodesAsync(IEnumerable<NodeUid> uids, CancellationToken cancellationToken)
    {
        return NodeOperations.RestoreFromTrashAsync(this, uids, cancellationToken);
    }

    public async IAsyncEnumerable<NodeUid> EnumerateTrashNodeUidsAsync([EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var volumeId = await VolumeOperations.TryGetMainVolumeIdAsync(this, cancellationToken).ConfigureAwait(false);
        if (volumeId is null)
        {
            // Nothing to enumerate if the main volume doesn't exist
            yield break;
        }

        await foreach (var entry in VolumeOperations.EnumerateTrashAsync(this, volumeId.Value, cancellationToken).ConfigureAwait(false))
        {
            yield return entry;
        }
    }

    public async ValueTask EmptyTrashAsync(CancellationToken cancellationToken)
    {
        var volumeId = await VolumeOperations.TryGetMainVolumeIdAsync(this, cancellationToken).ConfigureAwait(false);

        if (volumeId is null)
        {
            return;
        }

        await VolumeOperations.EmptyTrashAsync(this, volumeId.Value, cancellationToken).ConfigureAwait(false);
    }

    public IAsyncEnumerable<DriveEvent> EnumerateEventsAsync(
        DriveEventScopeId eventScopeId,
        DriveEventId? cursorEventId,
        CancellationToken cancellationToken = default)
    {
        return VolumeOperations.EnumerateEventsAsync(this, eventScopeId.VolumeId, cursorEventId, cancellationToken);
    }

    /// <summary>
    /// Iterates through all devices for the user. The results are not sorted and the order is not guaranteed.
    /// </summary>
    /// <remarks>
    /// If a device's name cannot be decrypted, no error is thrown, but the device's name is set to an erroring result.
    /// </remarks>
    public IAsyncEnumerable<Device> EnumerateDevicesAsync(CancellationToken cancellationToken = default)
    {
        return DeviceOperations.EnumerateDevicesAsync(this, cancellationToken);
    }

    /// <summary>
    /// Registers a new device for the current user.
    /// </summary>
    public ValueTask<Device> CreateDeviceAsync(string name, DeviceType deviceType, CancellationToken cancellationToken)
    {
        return DeviceOperations.CreateDeviceAsync(this, name, deviceType, cancellationToken);
    }

    /// <summary>
    /// Renames an existing device.
    /// </summary>
    public ValueTask<Device> RenameDeviceAsync(DeviceUid deviceUid, string name, CancellationToken cancellationToken)
    {
        return DeviceOperations.RenameDeviceAsync(this, deviceUid, name, cancellationToken);
    }

    /// <summary>
    /// Permanently deletes a device from the user's account.
    /// </summary>
    public ValueTask DeleteDeviceAsync(DeviceUid deviceUid, CancellationToken cancellationToken)
    {
        return DeviceOperations.DeleteDeviceAsync(this, deviceUid, cancellationToken);
    }

    private readonly record struct CreationParameters(
        IProtonAccountClient AccountClient,
        IDriveApiClients Api,
        INodeProvider NodeProvider,
        IDriveCache Cache,
        IBlockVerifierFactory BlockVerifierFactory,
        IFeatureFlagProvider FeatureFlagProvider,
        ITelemetry Telemetry,
        string? Uid = null,
        int? DegreeOfBlockTransferParallelism = null)
    {
        public static CreationParameters Create(
            IHttpClientFactory httpClientFactory,
            IProtonAccountClient accountClient,
            ICacheRepository? cacheRepository,
            IFeatureFlagProvider featureFlagProvider,
            ITelemetry telemetry,
            ProtonDriveClientOptions? options = null)
        {
            var defaultHttpClient = new SdkHttpClientFactoryDecorator(httpClientFactory, options?.BindingsLanguage).CreateClientWithTimeout(
                options?.DefaultApiTimeoutSecondsOverride ?? ProtonApiDefaults.DefaultTimeoutSeconds);

            var storageHttpClient = new SdkHttpClientFactoryDecorator(httpClientFactory, options?.BindingsLanguage).CreateClientWithTimeout(
                options?.StorageApiTimeoutSecondsOverride ?? ProtonDriveDefaults.StorageApiTimeoutSeconds);

            var api = new DriveApiClients(defaultHttpClient, storageHttpClient);

            return new CreationParameters(
                accountClient,
                api,
                new DriveNodeProvider(api),
                new DriveCache(cacheRepository),
                new BlockVerifierFactory(defaultHttpClient),
                featureFlagProvider,
                telemetry,
                options?.Uid,
                options?.DegreeOfBlockTransferParallelismOverride);
        }
    }
}
