using System.Text.Json;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Serialization;
using Proton.Sdk;
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
        var (exists, shareKey) = await _repository.TryGetDeserializedValueAsync(
            GetShareKeyCacheKey(shareId),
            SecretsSerializerContext.Default.PgpPrivateKey,
            cancellationToken).ConfigureAwait(false);

        return exists ? shareKey : null;
    }

    public ValueTask SetFolderSecretsAsync(
        NodeUid nodeId,
        Result<FolderSecrets, DegradedFolderSecrets> secretsProvisionResult,
        CancellationToken cancellationToken)
    {
        var serializedValue = JsonSerializer.Serialize(secretsProvisionResult, DriveSecretsSerializerContext.Default.ResultFolderSecretsDegradedFolderSecrets);

        return _repository.SetAsync(GetFolderSecretsCacheKey(nodeId), serializedValue, cancellationToken);
    }

    public async ValueTask<Result<FolderSecrets, DegradedFolderSecrets>?> TryGetFolderSecretsAsync(NodeUid nodeId, CancellationToken cancellationToken)
    {
        var (exists, folderSecrets) = await _repository.TryGetDeserializedValueAsync(
            GetFolderSecretsCacheKey(nodeId),
            DriveSecretsSerializerContext.Default.NullableResultFolderSecretsDegradedFolderSecrets,
            cancellationToken).ConfigureAwait(false);

        return exists ? folderSecrets : null;
    }

    public ValueTask SetFileSecretsAsync(
        NodeUid nodeId,
        Result<FileSecrets, DegradedFileSecrets> secretsProvisionResult,
        CancellationToken cancellationToken)
    {
        var serializedValue = JsonSerializer.Serialize(secretsProvisionResult, DriveSecretsSerializerContext.Default.ResultFileSecretsDegradedFileSecrets);

        return _repository.SetAsync(GetFileSecretsCacheKey(nodeId), serializedValue, cancellationToken);
    }

    public async ValueTask<Result<FileSecrets, DegradedFileSecrets>?> TryGetFileSecretsAsync(NodeUid nodeId, CancellationToken cancellationToken)
    {
        var (exists, fileSecrets) = await _repository.TryGetDeserializedValueAsync(
            GetFileSecretsCacheKey(nodeId),
            DriveSecretsSerializerContext.Default.NullableResultFileSecretsDegradedFileSecrets,
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
