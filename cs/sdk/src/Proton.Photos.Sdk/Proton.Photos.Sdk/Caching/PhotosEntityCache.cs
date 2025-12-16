using System.Text.Json;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Serialization;
using Proton.Drive.Sdk.Shares;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;
using Proton.Sdk.Caching;

namespace Proton.Photos.Sdk.Caching;

internal sealed class PhotosEntityCache(ICacheRepository repository) : IPhotosEntityCache
{
    private const string PhotoVolumeIdCacheKey = "volume:photos:id";
    private const string PhotosShareIdCacheKey = "share:photos:id";

    private readonly ICacheRepository _repository = repository;

    public ValueTask SetPhotosVolumeIdAsync(VolumeId volumeId, CancellationToken cancellationToken)
    {
        return _repository.SetAsync(PhotoVolumeIdCacheKey, volumeId.ToString(), cancellationToken);
    }

    public async ValueTask<VolumeId?> TryGetPhotosVolumeIdAsync(CancellationToken cancellationToken)
    {
        var value = await _repository.TryGetAsync(PhotoVolumeIdCacheKey, cancellationToken).ConfigureAwait(false);

        return value is not null ? (VolumeId?)value : null;
    }

    public ValueTask SetPhotosShareIdAsync(ShareId shareId, CancellationToken cancellationToken)
    {
        return _repository.SetAsync(PhotosShareIdCacheKey, shareId.ToString(), cancellationToken);
    }

    public async ValueTask<ShareId?> TryGetPhotosShareIdAsync(CancellationToken cancellationToken)
    {
        var value = await _repository.TryGetAsync(PhotosShareIdCacheKey, cancellationToken).ConfigureAwait(false);

        return value is not null ? (ShareId)value : null;
    }

    public ValueTask SetShareAsync(Share share, CancellationToken cancellationToken)
    {
        var serializedValue = JsonSerializer.Serialize(share, DriveEntitiesSerializerContext.Default.Share);

        return _repository.SetAsync(GetShareCacheKey(share.Id), serializedValue, cancellationToken);
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

    private static string GetShareCacheKey(ShareId shareId)
    {
        return $"share:{shareId}";
    }

    private static string GetNodeCacheKey(NodeUid nodeId)
    {
        return $"node:{nodeId}";
    }
}
