using System.Text.Json;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Serialization;
using Proton.Drive.Sdk.Shares;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;
using Proton.Sdk.Caching;

namespace Proton.Drive.Sdk.Caching;

internal sealed class DriveEntityCache(ICacheRepository repository) : IDriveEntityCache
{
    private const string ClientUidKey = "client:id";
    private const string MainVolumeIdCacheKey = "volume:main:id";
    private const string PhotosVolumeIdCacheKey = "volume:photos:id";
    private const string MyFilesShareIdCacheKey = "share:my-files:id";
    private const string PhotosShareIdCacheKey = "share:photos:id";

    private readonly ICacheRepository _repository = repository;

    public ValueTask SetClientUidAsync(string clientUid, CancellationToken cancellationToken)
    {
        return _repository.SetAsync(ClientUidKey, clientUid, cancellationToken);
    }

    public ValueTask<string?> TryGetClientUidAsync(CancellationToken cancellationToken)
    {
        return _repository.TryGetAsync(ClientUidKey, cancellationToken);
    }

    public ValueTask SetMainVolumeIdAsync(VolumeId? volumeId, CancellationToken cancellationToken)
    {
        var serializedValue = JsonSerializer.Serialize(volumeId, DriveEntitiesSerializerContext.Default.NullableVolumeId);

        return _repository.SetAsync(MainVolumeIdCacheKey, serializedValue, cancellationToken);
    }

    public async ValueTask<(bool Exists, VolumeId? VolumeId)> TryGetMainVolumeIdAsync(CancellationToken cancellationToken)
    {
        return await _repository.TryGetDeserializedValueAsync(
            MainVolumeIdCacheKey,
            DriveEntitiesSerializerContext.Default.NullableVolumeId,
            cancellationToken).ConfigureAwait(false);
    }

    public ValueTask SetPhotosVolumeIdAsync(VolumeId? volumeId, CancellationToken cancellationToken)
    {
        var serializedValue = JsonSerializer.Serialize(volumeId, DriveEntitiesSerializerContext.Default.NullableVolumeId);

        return _repository.SetAsync(PhotosVolumeIdCacheKey, serializedValue, cancellationToken);
    }

    public async ValueTask<(bool Exists, VolumeId? VolumeId)> TryGetPhotosVolumeIdAsync(CancellationToken cancellationToken)
    {
        return await _repository.TryGetDeserializedValueAsync(
            PhotosVolumeIdCacheKey,
            DriveEntitiesSerializerContext.Default.NullableVolumeId,
            cancellationToken).ConfigureAwait(false);
    }

    public ValueTask SetMyFilesShareIdAsync(ShareId shareId, CancellationToken cancellationToken)
    {
        return _repository.SetAsync(MyFilesShareIdCacheKey, shareId.ToString(), cancellationToken);
    }

    public async ValueTask<ShareId?> TryGetMyFilesShareIdAsync(CancellationToken cancellationToken)
    {
        var (exists, value) = await _repository.TryGetDeserializedValueAsync(
            MyFilesShareIdCacheKey,
            DriveEntitiesSerializerContext.Default.ShareId,
            cancellationToken).ConfigureAwait(false);

        return exists ? value : null;
    }

    public ValueTask SetPhotosShareIdAsync(ShareId shareId, CancellationToken cancellationToken)
    {
        return _repository.SetAsync(PhotosShareIdCacheKey, shareId.ToString(), cancellationToken);
    }

    public async ValueTask<ShareId?> TryGetPhotosShareIdAsync(CancellationToken cancellationToken)
    {
        var (exists, value) = await _repository.TryGetDeserializedValueAsync(
            PhotosShareIdCacheKey,
            DriveEntitiesSerializerContext.Default.ShareId,
            cancellationToken).ConfigureAwait(false);

        return exists ? value : null;
    }

    public ValueTask SetShareAsync(Share share, CancellationToken cancellationToken)
    {
        var serializedValue = JsonSerializer.Serialize(share, DriveEntitiesSerializerContext.Default.Share);

        return _repository.SetAsync(GetShareCacheKey(share.Id), serializedValue, cancellationToken);
    }

    public async ValueTask<Share?> TryGetShareAsync(ShareId shareId, CancellationToken cancellationToken)
    {
        var (exists, share) = await _repository.TryGetDeserializedValueAsync(
            GetShareCacheKey(shareId),
            DriveEntitiesSerializerContext.Default.Share,
            cancellationToken).ConfigureAwait(false);

        return exists ? share : null;
    }

    public ValueTask SetNodeAsync(
        NodeUid nodeId,
        Result<Node, DegradedNode> nodeProvisionResult,
        ShareId? membershipShareId,
        ReadOnlyMemory<byte> nameHashDigest,
        CancellationToken cancellationToken)
    {
        var serializedValue = JsonSerializer.Serialize(
            new CachedNodeInfo(nodeProvisionResult, membershipShareId, nameHashDigest),
            DriveEntitiesSerializerContext.Default.CachedNodeInfo);

        return _repository.SetAsync(GetNodeCacheKey(nodeId), serializedValue, cancellationToken);
    }

    public async ValueTask<CachedNodeInfo?> TryGetNodeAsync(NodeUid nodeId, CancellationToken cancellationToken)
    {
        var (exists, node) = await _repository.TryGetDeserializedValueAsync(
            GetNodeCacheKey(nodeId),
            DriveEntitiesSerializerContext.Default.CachedNodeInfo,
            cancellationToken).ConfigureAwait(false);

        return exists ? node : null;
    }

    public async ValueTask RemoveNodeAsync(NodeUid nodeUid, CancellationToken cancellationToken)
    {
        await _repository.RemoveAsync(GetNodeCacheKey(nodeUid), cancellationToken).ConfigureAwait(false);
    }

    public ValueTask ClearAsync()
    {
        return _repository.ClearAsync();
    }

    private static string GetShareCacheKey(ShareId shareId)
    {
        return $"share:{shareId}";
    }

    private static string GetNodeCacheKey(NodeUid nodeId)
    {
        return $"node:{nodeId}";
    }
}
