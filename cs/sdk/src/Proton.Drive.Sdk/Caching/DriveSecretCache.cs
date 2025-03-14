using System.Text.Json;
using Proton.Cryptography.Pgp;
using Proton.Sdk.Caching;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Caching;

internal sealed class DriveSecretCache(ICacheRepository repository) : IDriveSecretCache
{
    private readonly ICacheRepository _repository = repository;

    public ValueTask SetShareKeyAsync(ShareId shareId, PgpPrivateKey shareKey, CancellationToken cancellationToken)
    {
        var serializedValue = JsonSerializer.Serialize(shareKey, SecretsSerializerContext.Default.PgpPrivateKey);

        return _repository.SetAsync(GetShareKeyCacheKey(shareId), serializedValue, cancellationToken);
    }

    public async ValueTask<PgpPrivateKey?> TryGetShareKeyAsync(ShareId shareId, CancellationToken cancellationToken)
    {
        var serializedValue = await _repository.TryGetAsync(GetShareKeyCacheKey(shareId), cancellationToken).ConfigureAwait(false);

        return serializedValue is not null
            ? JsonSerializer.Deserialize(serializedValue, SecretsSerializerContext.Default.PgpPrivateKey)
            : null;
    }

    public ValueTask SetNodeKeyAsync(NodeUid nodeId, PgpPrivateKey nodeKey, CancellationToken cancellationToken)
    {
        var serializedValue = JsonSerializer.Serialize(nodeKey, SecretsSerializerContext.Default.PgpPrivateKey);

        return _repository.SetAsync(GetNodeKeyCacheKey(nodeId), serializedValue, cancellationToken);
    }

    public async ValueTask<PgpPrivateKey?> TryGetNodeKeyAsync(NodeUid nodeId, CancellationToken cancellationToken)
    {
        var serializedValue = await _repository.TryGetAsync(GetNodeKeyCacheKey(nodeId), cancellationToken).ConfigureAwait(false);

        return serializedValue is not null
            ? JsonSerializer.Deserialize(serializedValue, SecretsSerializerContext.Default.PgpPrivateKey)
            : null;
    }

    public ValueTask SetFolderHashKeyAsync(NodeUid nodeId, ReadOnlySpan<byte> folderHashKey, CancellationToken cancellationToken)
    {
        var serializedValue = Convert.ToBase64String(folderHashKey);

        return _repository.SetAsync(GetFolderHashKeyCacheKey(nodeId), serializedValue, cancellationToken);
    }

    public async ValueTask<ReadOnlyMemory<byte>?> TryGetFolderHashKeyAsync(NodeUid nodeId, CancellationToken cancellationToken)
    {
        var serializedValue = await _repository.TryGetAsync(GetFolderHashKeyCacheKey(nodeId), cancellationToken).ConfigureAwait(false);

        return serializedValue is not null
            ? Convert.FromBase64String(serializedValue)
            : null;
    }

    private static string GetShareKeyCacheKey(ShareId shareId)
    {
        return $"share:{shareId}:key";
    }

    private static string GetNodeKeyCacheKey(NodeUid nodeId)
    {
        return $"node:{nodeId}:key";
    }

    private static string GetFolderHashKeyCacheKey(NodeUid nodeId)
    {
        return $"node:{nodeId}:hash-key";
    }
}
