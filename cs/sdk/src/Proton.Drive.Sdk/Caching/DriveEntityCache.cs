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
    private const string MyFilesShareIdCacheKey = "share:my-files:id";

    private readonly ICacheRepository _repository = repository;

    public ValueTask SetClientUidAsync(string clientUid, CancellationToken cancellationToken)
    {
        return _repository.SetAsync(ClientUidKey, clientUid, cancellationToken);
    }

    public ValueTask<string?> TryGetClientUidAsync(CancellationToken cancellationToken)
    {
        return _repository.TryGetAsync(ClientUidKey, cancellationToken);
    }

    public ValueTask SetMainVolumeIdAsync(VolumeId volumeId, CancellationToken cancellationToken)
    {
        return _repository.SetAsync(MainVolumeIdCacheKey, volumeId.ToString(), cancellationToken);
    }

    public async ValueTask<VolumeId?> TryGetMainVolumeIdAsync(CancellationToken cancellationToken)
    {
        var value = await _repository.TryGetAsync(MainVolumeIdCacheKey, cancellationToken).ConfigureAwait(false);

        return value is not null ? (VolumeId?)value : null;
    }

    public ValueTask SetMyFilesShareIdAsync(ShareId shareId, CancellationToken cancellationToken)
    {
        return _repository.SetAsync(MyFilesShareIdCacheKey, shareId.ToString(), cancellationToken);
    }

    public async ValueTask<ShareId?> TryGetMyFilesShareIdAsync(CancellationToken cancellationToken)
    {
        var value = await _repository.TryGetAsync(MyFilesShareIdCacheKey, cancellationToken).ConfigureAwait(false);

        return value is not null ? (ShareId)value : null;
    }

    public ValueTask SetShareAsync(Share share, CancellationToken cancellationToken)
    {
        var serializedValue = JsonSerializer.Serialize(share, DriveEntitiesSerializerContext.Default.Share);

        return _repository.SetAsync(GetShareCacheKey(share.Id), serializedValue, cancellationToken);
    }

    public async ValueTask<Share?> TryGetShareAsync(ShareId shareId, CancellationToken cancellationToken)
    {
        var serializedValue = await _repository.TryGetAsync(GetShareCacheKey(shareId), cancellationToken).ConfigureAwait(false);

        return serializedValue is not null
            ? JsonSerializer.Deserialize(serializedValue, DriveEntitiesSerializerContext.Default.Share)
            : null;
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
        var serializedValue = await _repository.TryGetAsync(GetNodeCacheKey(nodeId), cancellationToken).ConfigureAwait(false);

        return serializedValue is not null
            ? JsonSerializer.Deserialize(serializedValue, DriveEntitiesSerializerContext.Default.CachedNodeInfo)
            : null;
    }

    public async ValueTask RemoveNodeAsync(NodeUid nodeUid, CancellationToken cancellationToken)
    {
        await _repository.RemoveAsync(GetNodeCacheKey(nodeUid), cancellationToken).ConfigureAwait(false);
    }

    private static string GetShareCacheKey(ShareId shareId)
    {
        return $"share:{shareId}";
    }

    private static string GetNodeCacheKey(NodeUid nodeId)
    {
        return $"node:{nodeId}";
    }

    public ValueTask ClearAsync()
    {
        return _repository.ClearAsync();
    }
}
