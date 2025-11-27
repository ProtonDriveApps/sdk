using Microsoft.IO;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api;
using Proton.Drive.Sdk.Caching;
using Proton.Drive.Sdk.Cryptography;
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
    private const int ApiTimeoutSeconds = 20;

    /// <summary>
    /// Creates a new instance of <see cref="ProtonDriveClient"/>.
    /// </summary>
    /// <param name="session">Authenticated API session.</param>
    /// <param name="uid">Unique ID for this client to allow it to resume drafts across instances.</param>
    /// <remarks>If no UID is not provided, one will be generated for the duration of this instance.</remarks>
    public ProtonDriveClient(ProtonApiSession session, string? uid = null)
        : this(
            session.GetHttpClient(ProtonDriveDefaults.DriveBaseRoute, TimeSpan.FromSeconds(ApiTimeoutSeconds)),
            new AccountClientAdapter(session),
            new DriveClientCache(session.ClientConfiguration.EntityCacheRepository, session.ClientConfiguration.SecretCacheRepository),
            session.ClientConfiguration.FeatureFlagProvider,
            session.ClientConfiguration.Telemetry,
            uid ?? Guid.NewGuid().ToString())
    {
    }

    public ProtonDriveClient(
        IHttpClientFactory httpClientFactory,
        IAccountClient accountClient,
        ICacheRepository entityCacheRepository,
        ICacheRepository secretCacheRepository,
        IFeatureFlagProvider featureFlagProvider,
        ITelemetry telemetry,
        string? bindingsLanguage = null,
        string? uid = null)
        : this(
            new SdkHttpClientFactoryDecorator(httpClientFactory, bindingsLanguage).CreateClient(),
            accountClient,
            new DriveClientCache(entityCacheRepository, secretCacheRepository),
            featureFlagProvider,
            telemetry,
            uid ?? Guid.NewGuid().ToString())
    {
    }

    internal ProtonDriveClient(
        IAccountClient accountClient,
        IDriveApiClients apiClients,
        IDriveClientCache cache,
        IBlockVerifierFactory blockVerifierFactory,
        IFeatureFlagProvider featureFlagProvider,
        ITelemetry telemetry,
        string uid)
    {
        Uid = uid;

        Account = accountClient;
        Api = apiClients;
        Cache = cache;
        BlockVerifierFactory = blockVerifierFactory;
        Telemetry = telemetry;
        FeatureFlagProvider = featureFlagProvider;

        var maxDegreeOfBlockTransferParallelism = Math.Max(
            Math.Min(Environment.ProcessorCount / 2, MaxDegreeOfBlockTransferParallelism),
            MinDegreeOfBlockTransferParallelism);

        var maxDegreeOfBlockProcessingParallelism = maxDegreeOfBlockTransferParallelism + Math.Min(Math.Max(maxDegreeOfBlockTransferParallelism / 2, 2), 4);

        RevisionCreationSemaphore = new FifoFlexibleSemaphore(maxDegreeOfBlockProcessingParallelism);
        BlockListingSemaphore = new FifoFlexibleSemaphore(maxDegreeOfBlockProcessingParallelism);

        BlockUploader = new BlockUploader(this, maxDegreeOfBlockTransferParallelism);
        BlockDownloader = new BlockDownloader(this, maxDegreeOfBlockTransferParallelism);
        ThumbnailBlockDownloader = new BlockDownloader(this, 8);
        PgpEnvironment.DefaultAeadStreamingChunkLength = PgpAeadStreamingChunkLength.ChunkLength;
    }

    private ProtonDriveClient(
        HttpClient httpClient,
        IAccountClient accountClient,
        IDriveClientCache cache,
        IFeatureFlagProvider featureFlagProvider,
        ITelemetry telemetry,
        string uid)
        : this(
            accountClient,
            new DriveApiClients(httpClient),
            cache,
            new BlockVerifierFactory(httpClient),
            featureFlagProvider,
            telemetry,
            uid)
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
    internal int MaxBlockSize { get; set; } = RevisionWriter.DefaultBlockSize * 3 / 2;

    internal BlockUploader BlockUploader { get; }
    internal BlockDownloader BlockDownloader { get; }
    internal BlockDownloader ThumbnailBlockDownloader { get; }

    internal Func<string, IEnumerable<string>> GetAlternateFileNames { get; } = AlternateFileNameGenerator.GetNames;

    public ValueTask<FolderNode> GetMyFilesFolderAsync(CancellationToken cancellationToken)
    {
        return NodeOperations.GetMyFilesFolderAsync(this, cancellationToken);
    }

    public ValueTask<FolderNode> CreateFolderAsync(NodeUid parentId, string name, CancellationToken cancellationToken)
    {
        return FolderOperations.CreateAsync(this, parentId, name, cancellationToken);
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
        return FileOperations.EnumerateThumbnailsAsync(this, fileUids, type, cancellationToken);
    }

    public async ValueTask<FileUploader> GetFileUploaderAsync(
        NodeUid parentFolderUid,
        string name,
        string mediaType,
        long size,
        DateTime? lastModificationTime,
        IEnumerable<AdditionalMetadataProperty>? additionalMetadata,
        bool overrideExistingDraftByOtherClient,
        CancellationToken cancellationToken)
    {
        var draftProvider = new NewFileDraftProvider(parentFolderUid, name, mediaType, overrideExistingDraftByOtherClient);

        return await GetFileUploaderAsync(draftProvider, size, lastModificationTime, additionalMetadata, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<FileUploader> GetFileRevisionUploaderAsync(
        RevisionUid currentActiveRevisionUid,
        long size,
        DateTime? lastModificationTime,
        IEnumerable<AdditionalMetadataProperty>? additionalMetadata,
        CancellationToken cancellationToken)
    {
        var draftProvider = new NewRevisionDraftProvider(currentActiveRevisionUid.NodeUid, currentActiveRevisionUid.RevisionId);

        return await GetFileUploaderAsync(draftProvider, size, lastModificationTime, additionalMetadata, cancellationToken).ConfigureAwait(false);
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

    public ValueTask<IReadOnlyDictionary<NodeUid, Result<string?>>> TrashNodesAsync(IEnumerable<NodeUid> uids, CancellationToken cancellationToken)
    {
        return NodeOperations.TrashAsync(this, uids, cancellationToken);
    }

    public ValueTask<IReadOnlyDictionary<NodeUid, Result<Exception>>> DeleteNodesAsync(IEnumerable<NodeUid> uids, CancellationToken cancellationToken)
    {
        return NodeOperations.DeleteAsync(this, uids, cancellationToken);
    }

    public ValueTask<IReadOnlyDictionary<NodeUid, Result<string?>>> RestoreNodesAsync(IEnumerable<NodeUid> uids, CancellationToken cancellationToken)
    {
        return NodeOperations.RestoreAsync(this, uids, cancellationToken);
    }

    public IAsyncEnumerable<Result<Node, DegradedNode>> EnumerateTrashAsync(CancellationToken cancellationToken)
    {
        return VolumeOperations.EnumerateTrashAsync(this, cancellationToken);
    }

    public ValueTask EmptyTrashAsync(CancellationToken cancellationToken)
    {
        return VolumeOperations.EmptyTrashAsync(this, cancellationToken);
    }

    private async ValueTask<FileUploader> GetFileUploaderAsync(
        IFileDraftProvider fileDraftProvider,
        long size,
        DateTime? lastModificationTime,
        IEnumerable<AdditionalMetadataProperty>? additionalMetadata,
        CancellationToken cancellationToken)
    {
        return await FileUploader.CreateAsync(this, fileDraftProvider, size, lastModificationTime, additionalMetadata, cancellationToken).ConfigureAwait(false);
    }
}
