using Microsoft.Extensions.Logging;
using Microsoft.IO;
using Proton.Drive.Sdk.Api;
using Proton.Drive.Sdk.Caching;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Nodes.Download;
using Proton.Drive.Sdk.Nodes.Upload;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;

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
    public ProtonDriveClient(ProtonApiSession session)
        : this(
            new AccountClientAdapter(session),
            new DriveApiClients(session.GetHttpClient(ProtonDriveDefaults.DriveBaseRoute, TimeSpan.FromSeconds(ApiTimeoutSeconds))),
            new DriveClientCache(session.ClientConfiguration.EntityCacheRepository, session.ClientConfiguration.SecretCacheRepository),
            session.ClientConfiguration.LoggerFactory)
    {
    }

    internal ProtonDriveClient(IAccountClient accountClient, IDriveApiClients apiClients, IDriveClientCache cache, ILoggerFactory loggerFactory)
    {
        Account = accountClient;
        Api = apiClients;
        Cache = cache;
        Logger = loggerFactory.CreateLogger<ProtonDriveClient>();

        var maxDegreeOfBlockTransferParallelism = Math.Max(
            Math.Min(Environment.ProcessorCount / 2, MaxDegreeOfBlockTransferParallelism),
            MinDegreeOfBlockTransferParallelism);

        var maxDegreeOfBlockProcessingParallelism = maxDegreeOfBlockTransferParallelism + Math.Min(Math.Max(maxDegreeOfBlockTransferParallelism / 2, 2), 4);

        RevisionCreationSemaphore = new FifoFlexibleSemaphore(maxDegreeOfBlockProcessingParallelism, loggerFactory.CreateLogger<FifoFlexibleSemaphore>());
        BlockListingSemaphore = new FifoFlexibleSemaphore(maxDegreeOfBlockProcessingParallelism, loggerFactory.CreateLogger<FifoFlexibleSemaphore>());

        BlockUploader = new BlockUploader(this, maxDegreeOfBlockTransferParallelism);
        BlockDownloader = new BlockDownloader(this, maxDegreeOfBlockTransferParallelism);
    }

    internal static RecyclableMemoryStreamManager MemoryStreamManager { get; } = new();

    internal IAccountClient Account { get; }
    internal IDriveApiClients Api { get; }
    internal IDriveClientCache Cache { get; }
    internal ILogger Logger { get; }

    internal FifoFlexibleSemaphore RevisionCreationSemaphore { get; }
    internal FifoFlexibleSemaphore BlockListingSemaphore { get; }

    internal BlockUploader BlockUploader { get; }
    internal BlockDownloader BlockDownloader { get; }

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

    public async ValueTask<FileUploader> GetFileUploaderAsync(
        string name,
        string mediaType,
        DateTime? lastModificationTime,
        long size,
        CancellationToken cancellationToken)
    {
        var expectedNumberOfBlocks = (int)size.DivideAndRoundUp(RevisionWriter.DefaultBlockSize);

        await RevisionCreationSemaphore.EnterAsync(expectedNumberOfBlocks, cancellationToken).ConfigureAwait(false);

        return new FileUploader(this, name, mediaType, lastModificationTime, expectedNumberOfBlocks);
    }

    public async ValueTask<FileDownloader> GetFileDownloaderAsync(RevisionUid revisionUid, CancellationToken cancellationToken)
    {
        await BlockListingSemaphore.EnterAsync(1, cancellationToken).ConfigureAwait(false);

        return new FileDownloader(this, revisionUid);
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

    public ValueTask<IReadOnlyDictionary<NodeUid, Result<string?>>> DeleteNodesAsync(IEnumerable<NodeUid> uids, CancellationToken cancellationToken)
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

    internal async ValueTask<string> GetClientUidAsync(CancellationToken cancellationToken)
    {
        var clientUid = await Cache.Entities.TryGetClientUidAsync(cancellationToken).ConfigureAwait(false);

        if (clientUid is null)
        {
            clientUid = Guid.NewGuid().ToString("N");

            await Cache.Entities.SetClientUidAsync(clientUid, cancellationToken).ConfigureAwait(false);
        }

        return clientUid;
    }
}
