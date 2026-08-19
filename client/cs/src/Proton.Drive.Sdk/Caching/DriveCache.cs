using System.Text.Json;
using System.Text.Json.Serialization.Metadata;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Serialization;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;
using Proton.Sdk.Caching;

namespace Proton.Drive.Sdk.Caching;

internal sealed class DriveCache(ICacheRepository? repository = null) : IDriveCache
{
    private const int ObjectSchemaVersion = 1;
    private const int SerializationVersion = 1;

    private const string MainVolumeIdCacheKey = "volume:main:id";
    private const string PhotosVolumeIdCacheKey = "volume:photos:id";

    private const int MaxMemoryEntries = 1000;
    private const double MemoryEvictionRatio = 0.25;

    private static readonly string ValueFormatVersion = $"obj:{ObjectSchemaVersion}.ser:{SerializationVersion}";

    private readonly HybridMemoryCache _memoryCache = new(MaxMemoryEntries, MemoryEvictionRatio);

    private readonly Lazy<Task<ICacheRepository>>? _getCacheRepository = repository is not null
        ? new Lazy<Task<ICacheRepository>>(async () =>
        {
            // If this fails, the cache will remain unusable until the next app restart, which we can live with (for now?).
            await repository.EnsureValueFormatVersionAsync(ValueFormatVersion, CancellationToken.None).ConfigureAwait(false);
            return repository;
        })
        : null;

    public async ValueTask<VolumeId?> GetOrCreateMainVolumeIdAsync(Func<CancellationToken, ValueTask<VolumeId?>> factory, CancellationToken cancellationToken)
    {
        return await GetOrCreateNullableAsync(MainVolumeIdCacheKey, DriveCacheSerializerContext.Default.NullableVolumeId, factory, cancellationToken)
            .ConfigureAwait(false);
    }

    public ValueTask SetMainVolumeIdAsync(VolumeId? volumeId, CancellationToken cancellationToken)
    {
        return SetAsync(MainVolumeIdCacheKey, volumeId, DriveCacheSerializerContext.Default.NullableVolumeId, cancellationToken);
    }

    public ValueTask<VolumeId?> GetOrCreatePhotosVolumeIdAsync(Func<CancellationToken, ValueTask<VolumeId?>> factory, CancellationToken cancellationToken)
    {
        return GetOrCreateNullableAsync(PhotosVolumeIdCacheKey, DriveCacheSerializerContext.Default.NullableVolumeId, factory, cancellationToken);
    }

    public ValueTask SetPhotosVolumeIdAsync(VolumeId? volumeId, CancellationToken cancellationToken)
    {
        return SetAsync(PhotosVolumeIdCacheKey, volumeId, DriveCacheSerializerContext.Default.NullableVolumeId, cancellationToken);
    }

    public ValueTask<PgpPrivateKey> GetOrCreateShareKeyAsync(
        ShareId shareId,
        Func<CancellationToken, ValueTask<PgpPrivateKey>> factory,
        CancellationToken cancellationToken)
    {
        return GetOrCreateAsync(GetShareKeyCacheKey(shareId), DriveSecretsSerializerContext.Default.PgpPrivateKey, factory, cancellationToken);
    }

    public ValueTask SetShareKeyAsync(ShareId shareId, PgpPrivateKey shareKey, CancellationToken cancellationToken)
    {
        return SetAsync(GetShareKeyCacheKey(shareId), shareKey, DriveSecretsSerializerContext.Default.PgpPrivateKey, cancellationToken);
    }

    public ValueTask<Option<NodeOperationData>> TryGetNodeOperationDataAsync(NodeUid nodeId, CancellationToken cancellationToken)
    {
        return TryGetAsync(
            GetNodeOperationDataCacheKey(nodeId),
            DriveSecretsSerializerContext.Default.NodeOperationData,
            Option<NodeOperationData>.FromNullable,
            cancellationToken);
    }

    public ValueTask SetNodeOperationDataAsync(NodeUid nodeId, NodeOperationData operationData, CancellationToken cancellationToken)
    {
        return SetAsync(GetNodeOperationDataCacheKey(nodeId), operationData, DriveSecretsSerializerContext.Default.NodeOperationData, cancellationToken);
    }

    public async ValueTask ClearAsync()
    {
        _memoryCache.Clear();

        if (_getCacheRepository is not null)
        {
            var repo = await _getCacheRepository.Value.ConfigureAwait(false);
            await repo.ClearAsync().ConfigureAwait(false);
        }
    }

    private static string GetShareKeyCacheKey(ShareId shareId)
    {
        return $"share:{shareId}:key";
    }

    private static string GetNodeOperationDataCacheKey(NodeUid nodeId)
    {
        return $"node:{nodeId}";
    }

    private async ValueTask<Option<T>> TryGetAsync<T>(
        string key,
        JsonTypeInfo<T> typeInfo,
        Func<T?, Option<T>> convertToCacheHitOption,
        CancellationToken cancellationToken)
    {
        if (_memoryCache.TryGet<T>(key, out var memoryCached))
        {
            return Option<T>.Some(memoryCached);
        }

        var repositoryValueOrNone = await TryReadFromRepositoryAsync(key, typeInfo, convertToCacheHitOption, cancellationToken).ConfigureAwait(false);

        if (repositoryValueOrNone.TryGetValue(out var repositoryValue))
        {
            _memoryCache.Set(key, repositoryValue);
            return Option<T>.Some(repositoryValue);
        }

        return Option<T>.None;
    }

    private ValueTask<T?> GetOrCreateNullableAsync<T>(
        string key,
        JsonTypeInfo<T?> typeInfo,
        Func<CancellationToken, ValueTask<T?>> factory,
        CancellationToken cancellationToken)
    {
        return GetOrCreateAsync(key, typeInfo, factory, Option<T?>.Some, cancellationToken);
    }

    private ValueTask<T> GetOrCreateAsync<T>(
        string key,
        JsonTypeInfo<T> typeInfo,
        Func<CancellationToken, ValueTask<T>> factory,
        CancellationToken cancellationToken)
        where T : notnull
    {
        return GetOrCreateAsync(key, typeInfo, factory, Option<T>.FromNullable, cancellationToken);
    }

    private ValueTask<T> GetOrCreateAsync<T>(
        string key,
        JsonTypeInfo<T> typeInfo,
        Func<CancellationToken, ValueTask<T>> factory,
        Func<T?, Option<T>> convertToCacheHitOption,
        CancellationToken cancellationToken)
    {
        return _memoryCache.GetOrCreateAsync(
            key,
            async ct =>
            {
                var repositoryValueOrNone = await TryReadFromRepositoryAsync(key, typeInfo, convertToCacheHitOption, ct).ConfigureAwait(false);

                if (repositoryValueOrNone.TryGetValue(out var repositoryValue))
                {
                    return repositoryValue;
                }

                var value = await factory.Invoke(ct).ConfigureAwait(false);

                await WriteToRepositoryAsync(key, value, typeInfo, ct).ConfigureAwait(false);

                return value;
            },
            cancellationToken);
    }

    private ValueTask SetAsync<T>(string key, T value, JsonTypeInfo<T> typeInfo, CancellationToken cancellationToken)
    {
        _memoryCache.Set(key, value);

        return WriteToRepositoryAsync(key, value, typeInfo, cancellationToken);
    }

    private async ValueTask<Option<T>> TryReadFromRepositoryAsync<T>(
        string key,
        JsonTypeInfo<T> typeInfo,
        Func<T?, Option<T>> convertToCacheHitOption,
        CancellationToken cancellationToken)
    {
        if (_getCacheRepository is null)
        {
            return Option<T>.None;
        }

        var repo = await _getCacheRepository.Value.ConfigureAwait(false);
        return await repo.TryGetDeserializedValueAsync(key, typeInfo, convertToCacheHitOption, cancellationToken).ConfigureAwait(false);
    }

    private async ValueTask WriteToRepositoryAsync<T>(string key, T value, JsonTypeInfo<T> typeInfo, CancellationToken cancellationToken)
    {
        if (_getCacheRepository is null)
        {
            return;
        }

        var repo = await _getCacheRepository.Value.ConfigureAwait(false);
        var serializedValue = JsonSerializer.SerializeToUtf8Bytes(value, typeInfo);

        await repo.SetAsync(key, serializedValue, cancellationToken).ConfigureAwait(false);
    }
}
