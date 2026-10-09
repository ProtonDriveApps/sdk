using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Api.Volumes;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Photos;

internal interface IPhotosApiClient
{
    ValueTask<VolumeCreationResponse> CreateVolumeAsync(PhotosVolumeCreationRequest request, CancellationToken cancellationToken);

    ValueTask<ShareResponseV2> GetRootShareAsync(CancellationToken cancellationToken);

    ValueTask<TimelinePhotoListResponse> GetTimelinePhotosAsync(TimelinePhotoListRequest request, CancellationToken cancellationToken);

    ValueTask<AlbumListResponse> GetAlbumsAsync(VolumeId volumeId, LinkId? anchorId, CancellationToken cancellationToken);

    ValueTask<AlbumItemListResponse> GetAlbumItemsAsync(VolumeId volumeId, LinkId albumLinkId, LinkId? anchorId, CancellationToken cancellationToken);

    ValueTask<SharedAlbumsResponse> GetSharedAlbumsAsync(LinkId? anchorId, CancellationToken cancellationToken);

    ValueTask<LinkDetailsResponse> GetDetailsAsync(VolumeId volumeId, IEnumerable<LinkId> linkIds, CancellationToken cancellationToken);

    ValueTask<FindDuplicatesResponse> FindDuplicatesAsync(
        VolumeId volumeId,
        IReadOnlyList<ReadOnlyMemory<byte>> nameHashes,
        CancellationToken cancellationToken);

    ValueTask<ApiResponse> AddPhotoTagsAsync(VolumeId volumeId, LinkId linkId, IReadOnlyList<int> tags, CancellationToken cancellationToken);

    ValueTask<ApiResponse> RemovePhotoTagsAsync(VolumeId volumeId, LinkId linkId, IReadOnlyList<int> tags, CancellationToken cancellationToken);

    ValueTask<ApiResponse> SetPhotoFavoriteAsync(VolumeId volumeId, LinkId linkId, CancellationToken cancellationToken);

    ValueTask<ApiResponse> SetPhotoFavoriteAsync(VolumeId volumeId, LinkId linkId, FavoritePhotoRequest request, CancellationToken cancellationToken);

    ValueTask<AggregateApiResponse<TransferPhotoResponsePair>> TransferPhotosAsync(
        VolumeId volumeId,
        TransferPhotosRequest request,
        CancellationToken cancellationToken);

    ValueTask<CopyPhotoResponse> CopyPhotoAsync(
        VolumeId sourceVolumeId,
        LinkId sourceLinkId,
        CopyPhotoRequest request,
        CancellationToken cancellationToken);

    ValueTask<AggregateApiResponse<TransferPhotoResponsePair>> AddPhotosToAlbumAsync(
        VolumeId volumeId,
        LinkId albumLinkId,
        AddPhotosToAlbumRequest request,
        CancellationToken cancellationToken);

    ValueTask<ApiResponse> RemovePhotosFromAlbumAsync(
        VolumeId volumeId,
        LinkId albumLinkId,
        MultipleLinksNullaryRequest request,
        CancellationToken cancellationToken);

    ValueTask<ApiResponse> UpdateAlbumAsync(VolumeId volumeId, LinkId albumLinkId, UpdateAlbumRequest request, CancellationToken cancellationToken);

    ValueTask<ApiResponse> DeleteAlbumAsync(
        VolumeId volumeId,
        LinkId albumLinkId,
        bool deleteAlbumPhotos,
        CancellationToken cancellationToken);

    ValueTask<CreateAlbumResponse> CreateAlbumAsync(VolumeId volumeId, CreateAlbumRequest request, CancellationToken cancellationToken);

    ValueTask ReportRecentlyAccessedAsync(ReportRecentlyAccessedItemsRequest request, CancellationToken cancellationToken);
}
