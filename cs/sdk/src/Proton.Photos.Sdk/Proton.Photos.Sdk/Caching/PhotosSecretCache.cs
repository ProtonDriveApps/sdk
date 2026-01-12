using System.Text.Json;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Caching;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Serialization;
using Proton.Sdk;
using Proton.Sdk.Caching;
using Proton.Sdk.Serialization;

namespace Proton.Photos.Sdk.Caching;

internal sealed class PhotosSecretCache(ICacheRepository repository) : IDriveSecretCache
{
    private readonly ICacheRepository _repository = repository;

    public ValueTask SetShareKeyAsync(ShareId shareId, PgpPrivateKey shareKey, CancellationToken cancellationToken)
    {
        var serializedValue = JsonSerializer.Serialize(shareKey, SecretsSerializerContext.Default.PgpPrivateKey);

        return _repository.SetAsync(GetShareKeyCacheKey(shareId), serializedValue, cancellationToken);
    }

    public ValueTask<PgpPrivateKey?> TryGetShareKeyAsync(ShareId shareId, CancellationToken cancellationToken)
    {
        throw new NotSupportedException();
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
        var serializedValue = await _repository.TryGetAsync(GetFolderSecretsCacheKey(nodeId), cancellationToken).ConfigureAwait(false);

        return serializedValue is not null
            ? JsonSerializer.Deserialize(serializedValue, DriveSecretsSerializerContext.Default.NullableResultFolderSecretsDegradedFolderSecrets)
            : null;
    }

    public ValueTask SetFileSecretsAsync(
        NodeUid nodeId,
        Result<FileSecrets, DegradedFileSecrets> secretsProvisionResult,
        CancellationToken cancellationToken)
    {
        var serializedValue = JsonSerializer.Serialize(secretsProvisionResult, DriveSecretsSerializerContext.Default.ResultFileSecretsDegradedFileSecrets);

        return _repository.SetAsync(GetFileSecretsCacheKey(nodeId), serializedValue, cancellationToken);
    }

    public ValueTask<Result<FileSecrets, DegradedFileSecrets>?> TryGetFileSecretsAsync(NodeUid nodeId, CancellationToken cancellationToken)
    {
        throw new NotSupportedException();
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
