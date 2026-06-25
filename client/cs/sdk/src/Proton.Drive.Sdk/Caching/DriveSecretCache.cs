using System.Text.Json;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Serialization;
using Proton.Sdk.Caching;

namespace Proton.Drive.Sdk.Caching;

internal sealed class DriveSecretCache(ICacheRepository repository) : IDriveSecretCache
{
    private readonly ICacheRepository _repository = repository;

    public ValueTask SetShareKeyAsync(ShareId shareId, PgpPrivateKey shareKey, CancellationToken cancellationToken)
    {
        var serializedValue = JsonSerializer.Serialize(shareKey, DriveSecretsSerializerContext.Default.PgpPrivateKey);

        return _repository.SetAsync(GetShareKeyCacheKey(shareId), serializedValue, cancellationToken);
    }

    public async ValueTask<PgpPrivateKey?> TryGetShareKeyAsync(ShareId shareId, CancellationToken cancellationToken)
    {
        var (exists, shareKey) = await _repository.TryGetDeserializedValueAsync(
            GetShareKeyCacheKey(shareId),
            DriveSecretsSerializerContext.Default.PgpPrivateKey,
            cancellationToken).ConfigureAwait(false);

        return exists ? shareKey : null;
    }

    public ValueTask SetFolderSecretsAsync(NodeUid nodeId, FolderSecrets secrets, CancellationToken cancellationToken)
    {
        var serializedValue = JsonSerializer.Serialize(secrets, DriveSecretsSerializerContext.Default.FolderSecrets);

        return _repository.SetAsync(GetFolderSecretsCacheKey(nodeId), serializedValue, cancellationToken);
    }

    public async ValueTask<FolderSecrets?> TryGetFolderSecretsAsync(NodeUid nodeId, CancellationToken cancellationToken)
    {
        var (exists, folderSecrets) = await _repository.TryGetDeserializedValueAsync(
            GetFolderSecretsCacheKey(nodeId),
            DriveSecretsSerializerContext.Default.FolderSecrets,
            cancellationToken).ConfigureAwait(false);

        return exists ? folderSecrets : null;
    }

    public ValueTask SetFileSecretsAsync(NodeUid nodeId, FileSecrets secrets, CancellationToken cancellationToken)
    {
        var serializedValue = JsonSerializer.Serialize(secrets, DriveSecretsSerializerContext.Default.FileSecrets);

        return _repository.SetAsync(GetFileSecretsCacheKey(nodeId), serializedValue, cancellationToken);
    }

    public async ValueTask<FileSecrets?> TryGetFileSecretsAsync(NodeUid nodeId, CancellationToken cancellationToken)
    {
        var (exists, fileSecrets) = await _repository.TryGetDeserializedValueAsync(
            GetFileSecretsCacheKey(nodeId),
            DriveSecretsSerializerContext.Default.FileSecrets,
            cancellationToken).ConfigureAwait(false);

        return exists ? fileSecrets : null;
    }

    public ValueTask ClearAsync()
    {
        return _repository.ClearAsync();
    }

    private static string GetShareKeyCacheKey(ShareId shareId)
    {
        return $"share:{shareId}:key";
    }

    private static string GetFolderSecretsCacheKey(NodeUid nodeId)
    {
        return $"folder:{nodeId}:secrets";
    }

    private static string GetFileSecretsCacheKey(NodeUid nodeId)
    {
        return $"file:{nodeId}:secrets";
    }
}
