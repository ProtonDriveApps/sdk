using System.Runtime.CompilerServices;
using Microsoft.IO;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api;
using Proton.Drive.Sdk.Caching;
using Proton.Drive.Sdk.Cryptography;
using Proton.Drive.Sdk.Http;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Nodes.Download;
using Proton.Drive.Sdk.Nodes.Upload;
using Proton.Drive.Sdk.Nodes.Upload.Verification;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;
using Proton.Sdk.Caching;
using Proton.Sdk.Http;
using Proton.Sdk.Telemetry;

namespace Proton.Drive.Sdk;

public sealed class ProtonDriveClient
{
    private const int MinDegreeOfBlockTransferParallelism = 2;
    private const int MaxDegreeOfBlockTransferParallelism = 6;

    /// <summary>
    /// Creates a new instance of <see cref="ProtonDriveClient"/>.
    /// </summary>
    /// <param name="session">Authenticated API session.</param>
    /// <param name="uid">Unique ID for this client to allow it to resume drafts across instances.</param>
    /// <remarks>If no UID is not provided, one will be generated for the duration of this instance.</remarks>
    public ProtonDriveClient(ProtonApiSession session, string? uid = null, int? blockTransferDegreeOfParallelism = null)
        : this(
            session,
            (defaultApiHttpClient, storageApiHttpClient) => new DriveApiClients(defaultApiHttpClient, storageApiHttpClient),
            uid,
            blockTransferDegreeOfParallelism)
    {
    }

    public ProtonDriveClient(
        IHttpClientFactory httpClientFactory,
        IAccountClient accountClient,
        ICacheRepository entityCacheRepository,
        ICacheRepository secretCacheRepository,
        IFeatureFlagProvider featureFlagProvider,
        ITelemetry telemetry,
        ProtonDriveClientOptions? creationParameters = null)
        : this(
            new SdkHttpClientFactoryDecorator(httpClientFactory, creationParameters?.BindingsLanguage).CreateClientWithTimeout(
                creationParameters?.OverrideDefaultApiTimeoutSeconds ?? ProtonApiDefaults.DefaultTimeoutSeconds),
            new SdkHttpClientFactoryDecorator(httpClientFactory, creationParameters?.BindingsLanguage).CreateClientWithTimeout(
                creationParameters?.OverrideStorageApiTimeoutSeconds ?? ProtonDriveDefaults.StorageApiTimeoutSeconds),
            accountClient,
            new DriveClientCache(entityCacheRepository, secretCacheRepository),
            featureFlagProvider,
            telemetry,
            (defaultApiHttpClient, storageApiHttpClient) => new DriveApiClients(defaultApiHttpClient, storageApiHttpClient),
                creationParameters?.Uid ?? Guid.NewGuid().ToString(),
                creationParameters?.BlockTransferDegreeOfParallelism)
    {
    }

    internal ProtonDriveClient(
        ProtonApiSession session,
        Func<HttpClient, HttpClient, IDriveApiClients> driveApiClientsFactory,
        string? uid = null,
        int? blockTransferDegreeOfParallelism = null)
        : this(
            session.GetHttpClient(ProtonDriveDefaults.DriveBaseRoute, TimeSpan.FromSeconds(ProtonApiDefaults.DefaultTimeoutSeconds)),
            session.GetHttpClient(
                ProtonDriveDefaults.DriveBaseRoute,
                TimeSpan.FromSeconds(ProtonDriveDefaults.StorageApiTimeoutSeconds),
                TimeSpan.FromSeconds(ProtonDriveDefaults.StorageApiTimeoutSeconds)),
            new AccountClientAdapter(session),
            new DriveClientCache(session.ClientConfiguration.EntityCacheRepository, session.ClientConfiguration.SecretCacheRepository),
            session.ClientConfiguration.FeatureFlagProvider,
            session.ClientConfiguration.Telemetry,
            driveApiClientsFactory,
            uid ?? Guid.NewGuid().ToString(),
            blockTransferDegreeOfParallelism)
    {
    }

    internal ProtonDriveClient(
        IHttpClientFactory httpClientFactory,
        IAccountClient accountClient,
        ICacheRepository entityCacheRepository,
        ICacheRepository secretCacheRepository,
        IFeatureFlagProvider featureFlagProvider,
        ITelemetry telemetry,
        Func<HttpClient, HttpClient, IDriveApiClients> driveApiClientsFactory,
        ProtonDriveClientOptions? creationParameters = null)
        : this(
            new SdkHttpClientFactoryDecorator(httpClientFactory, creationParameters?.BindingsLanguage).CreateClientWithTimeout(
                creationParameters?.OverrideDefaultApiTimeoutSeconds ?? ProtonApiDefaults.DefaultTimeoutSeconds),
            new SdkHttpClientFactoryDecorator(httpClientFactory, creationParameters?.BindingsLanguage).CreateClientWithTimeout(
                creationParameters?.OverrideStorageApiTimeoutSeconds ?? ProtonDriveDefaults.StorageApiTimeoutSeconds),
            accountClient,
            new DriveClientCache(entityCacheRepository, secretCacheRepository),
            featureFlagProvider,
            telemetry,
            driveApiClientsFactory,
            creationParameters?.Uid ?? Guid.NewGuid().ToString(),
            creationParameters?.BlockTransferDegreeOfParallelism)
    {
    }

    internal ProtonDriveClient(
        IAccountClient accountClient,
        IDriveApiClients api,
        IDriveClientCache cache,
        IBlockVerifierFactory blockVerifierFactory,
        IFeatureFlagProvider featureFlagProvider,
        ITelemetry telemetry,
        string uid,
        int? blockTransferDegreeOfParallelism = null)
    {
        Uid = uid;

        Account = accountClient;
        Api = api;
        Cache = cache;
        BlockVerifierFactory = blockVerifierFactory;
        Telemetry = telemetry;
        FeatureFlagProvider = featureFlagProvider;

        var maxDegreeOfBlockTransferParallelism = Math.Clamp(
            blockTransferDegreeOfParallelism
            ?? Math.Max(Math.Min(Environment.ProcessorCount / 2, MaxDegreeOfBlockTransferParallelism), MinDegreeOfBlockTransferParallelism),
            MinDegreeOfBlockTransferParallelism,
            MaxDegreeOfBlockTransferParallelism);

        var maxDegreeOfBlockProcessingParallelism = maxDegreeOfBlockTransferParallelism + Math.Min(Math.Max(maxDegreeOfBlockTransferParallelism / 2, 2), 4);

        RevisionCreationSemaphore = new FifoFlexibleSemaphore(maxDegreeOfBlockProcessingParallelism);
        BlockListingSemaphore = new FifoFlexibleSemaphore(maxDegreeOfBlockProcessingParallelism);

        BlockUploader = new BlockUploader(this, maxDegreeOfBlockTransferParallelism);
        BlockDownloader = new BlockDownloader(this, maxDegreeOfBlockTransferParallelism);
        ThumbnailBlockDownloader = new BlockDownloader(this, 8);
        PgpEnvironment.DefaultAeadStreamingChunkLength = PgpAeadStreamingChunkLength.ChunkLength;
    }

    private ProtonDriveClient(
        HttpClient defaultApiHttpClient,
        HttpClient storageApiHttpClient,
        IAccountClient accountClient,
        IDriveClientCache cache,
        IFeatureFlagProvider featureFlagProvider,
        ITelemetry telemetry,
        Func<HttpClient, HttpClient, IDriveApiClients> driveApiClientsFactory,
        string uid,
        int? blockTransferDegreeOfParallelism = null)
        : this(
            accountClient,
            driveApiClientsFactory.Invoke(defaultApiHttpClient, storageApiHttpClient),
            cache,
            new BlockVerifierFactory(defaultApiHttpClient),
            featureFlagProvider,
            telemetry,
            uid,
            blockTransferDegreeOfParallelism)
    {
    }

    // use 132KiB to align and provide some padding for AEAD chunk size (128KiB + PGP headers)
    internal static RecyclableMemoryStreamManager MemoryStreamManager { get; } = new(new RecyclableMemoryStreamManager.Options { BlockSize = 135168 });

    internal string Uid { get; }

    internal IAccountClient Account { get; }
    internal IDriveApiClients Api { get; }
    internal IDriveClientCache Cache { get; }
    internal IBlockVerifierFactory BlockVerifierFactory { get; }
    internal ITelemetry Telemetry { get; }
    internal IFeatureFlagProvider FeatureFlagProvider { get; }

    internal FifoFlexibleSemaphore RevisionCreationSemaphore { get; }
    internal FifoFlexibleSemaphore BlockListingSemaphore { get; }

    internal int TargetBlockSize { get; set; } = RevisionWriter.DefaultBlockSize;

    internal BlockUploader BlockUploader { get; }
    internal BlockDownloader BlockDownloader { get; }
    internal BlockDownloader ThumbnailBlockDownloader { get; }

    internal Func<string, IEnumerable<string>> GetAlternateFileNames { get; } = AlternateFileNameGenerator.GetNames;

    public ValueTask<FolderNode> GetMyFilesFolderAsync(CancellationToken cancellationToken)
    {
        return NodeOperations.GetOrCreateMyFilesFolderAsync(this, cancellationToken);
    }

    public ValueTask<Result<Node, DegradedNode>?> GetNodeAsync(NodeUid nodeUid, CancellationToken cancellationToken)
    {
        return NodeOperations
            .EnumerateNodesAsync(this, nodeUid.VolumeId, [nodeUid.LinkId], forPhotos: false, cancellationToken)
            .Select(x => (Result<Node, DegradedNode>?)x)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public IAsyncEnumerable<Result<Node, DegradedNode>> EnumerateNodesAsync(IEnumerable<NodeUid> nodeUids, CancellationToken cancellationToken = default)
    {
        return NodeOperations.EnumerateNodesAsync(this, nodeUids, forPhotos: false, cancellationToken);
    }

    public ValueTask<FolderNode> CreateFolderAsync(NodeUid parentId, string name, DateTime? lastModificationTime, CancellationToken cancellationToken)
    {
        return FolderOperations.CreateAsync(this, parentId, name, lastModificationTime, cancellationToken);
    }

    public IAsyncEnumerable<Result<Node, DegradedNode>> EnumerateFolderChildrenAsync(NodeUid folderId, CancellationToken cancellationToken = default)
    {
        return FolderOperations.EnumerateChildrenAsync(this, folderId, cancellationToken);
    }

    public IAsyncEnumerable<FileThumbnail> EnumerateThumbnailsAsync(
        IEnumerable<NodeUid> fileUids,
        ThumbnailType type,
        CancellationToken cancellationToken = default)
    {
        return FileOperations.EnumerateThumbnailsAsync(this, fileUids, type, forPhotos: false, cancellationToken);
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

        return await GetFileUploaderAsync(draftProvider, parentFolderUid, size, metadata, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<FileUploader> GetFileRevisionUploaderAsync(
        RevisionUid currentActiveRevisionUid,
        long size,
        FileUploadMetadata metadata,
        CancellationToken cancellationToken)
    {
        var draftProvider = new NewRevisionDraftProvider(this, currentActiveRevisionUid.NodeUid, currentActiveRevisionUid.RevisionId);

        return await GetFileUploaderAsync(draftProvider, currentActiveRevisionUid.NodeUid, size, metadata, cancellationToken).ConfigureAwait(false);
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

    public async ValueTask MoveNodesAsync(IEnumerable<NodeUid> uids, NodeUid newParentFolderUid, CancellationToken cancellationToken)
    {
        // FIXME: finalize the implementation that uses the batch move endpoint, and use it instead of this naïve code
        foreach (var uid in uids)
        {
            await NodeOperations.MoveSingleAsync(this, uid, newParentFolderUid, newName: null, cancellationToken).ConfigureAwait(false);
        }
    }

    public ValueTask RenameNodeAsync(NodeUid uid, string newName, string? newMediaType, CancellationToken cancellationToken)
    {
        return NodeOperations.RenameAsync(this, uid, newName, newMediaType, cancellationToken);
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

    public async IAsyncEnumerable<Result<Node, DegradedNode>> EnumerateTrashAsync([EnumeratorCancellation] CancellationToken cancellationToken)
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

    public ValueTask EmptyTrashAsync(CancellationToken cancellationToken)
    {
        return VolumeOperations.EmptyTrashAsync(this, cancellationToken);
    }

    private async ValueTask<FileUploader> GetFileUploaderAsync(
        IRevisionDraftProvider revisionDraftProvider,
        NodeUid telemetryContextNodeUid,
        long size,
        FileUploadMetadata metadata,
        CancellationToken cancellationToken)
    {
        return await FileUploader.CreateAsync(this, revisionDraftProvider, telemetryContextNodeUid, size, metadata, cancellationToken).ConfigureAwait(false);
    }
}
