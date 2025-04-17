using Proton.Drive.Sdk.Api;
using Proton.Drive.Sdk.Caching;
using Proton.Drive.Sdk.Nodes;
using Proton.Sdk;

namespace Proton.Drive.Sdk;

public sealed class ProtonDriveClient
{
    private const int ApiTimeoutSeconds = 20;

    /// <summary>
    /// Creates a new instance of <see cref="ProtonDriveClient"/>.
    /// </summary>
    /// <param name="session">Authenticated API session.</param>
    public ProtonDriveClient(ProtonApiSession session)
        : this(
            new AccountClientAdapter(session),
            new DriveApiClients(session.GetHttpClient(ProtonDriveDefaults.DriveBaseRoute, TimeSpan.FromSeconds(ApiTimeoutSeconds))),
            new DriveClientCache(session.ClientConfiguration.EntityCacheRepository, session.ClientConfiguration.SecretCacheRepository))
    {
    }

    internal ProtonDriveClient(IAccountClient accountClient, IDriveApiClients apiClients, IDriveClientCache cache)
    {
        Account = accountClient;
        Api = apiClients;
        Cache = cache;
    }

    internal IAccountClient Account { get; }

    internal IDriveApiClients Api { get; }

    internal IDriveClientCache Cache { get; }

    public ValueTask<FolderNode> GetMyFilesFolderAsync(CancellationToken cancellationToken)
    {
        return NodeOperations.GetMyFilesFolderAsync(this, cancellationToken);
    }

    public ValueTask<FolderNode> CreateFolderAsync(NodeUid parentId, string name, CancellationToken cancellationToken)
    {
        return FolderOperations.CreateFolderAsync(this, parentId, name, cancellationToken);
    }

    public IAsyncEnumerable<Result<Node, DegradedNode>> EnumerateFolderChildrenAsync(NodeUid folderId, CancellationToken cancellationToken = default)
    {
        return FolderOperations.EnumerateFolderChildrenAsync(this, folderId, cancellationToken);
    }
}
