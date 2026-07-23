using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Api.Volumes;
using Proton.Drive.Sdk.Serialization;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Api;
using Proton.Sdk.Api.Http;

namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class PhotosApiClient(HttpClient httpClient) : IPhotosApiClient
{
    private readonly HttpClient _httpClient = httpClient;

    public async ValueTask<VolumeCreationResponse> CreateVolumeAsync(PhotosVolumeCreationRequest request, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.VolumeCreationResponse)
            .PostAsync("photos/volumes", request, PhotosApiSerializerContext.Default.PhotosVolumeCreationRequest, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<ShareResponseV2> GetRootShareAsync(CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.ShareResponseV2)
            .GetAsync("v2/shares/photos", cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<TimelinePhotoListResponse> GetTimelinePhotosAsync(TimelinePhotoListRequest request, CancellationToken cancellationToken)
    {
        var query = request.PreviousPageLastLinkId is not null ? $"?PreviousPageLastLinkID={request.PreviousPageLastLinkId}" : string.Empty;

        return await _httpClient
            .Expecting(PhotosApiSerializerContext.Default.TimelinePhotoListResponse)
            .GetAsync($"volumes/{request.VolumeId}/photos{query}", cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<AlbumListResponse> GetAlbumsAsync(VolumeId volumeId, LinkId? anchorId, CancellationToken cancellationToken)
    {
        var query = anchorId is not null ? $"?AnchorID={anchorId}" : string.Empty;

        return await _httpClient
            .Expecting(PhotosApiSerializerContext.Default.AlbumListResponse)
            .GetAsync($"photos/volumes/{volumeId}/albums{query}", cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<AlbumItemListResponse> GetAlbumItemsAsync(
        VolumeId volumeId,
        LinkId albumLinkId,
        LinkId? anchorId,
        CancellationToken cancellationToken)
    {
        var anchor = anchorId is not null ? $"&AnchorID={anchorId}" : string.Empty;

        return await _httpClient
            .Expecting(PhotosApiSerializerContext.Default.AlbumItemListResponse)
            .GetAsync($"photos/volumes/{volumeId}/albums/{albumLinkId}/children?Sort=Captured&Desc=1{anchor}", cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<LinkDetailsResponse> GetDetailsAsync(VolumeId volumeId, IEnumerable<LinkId> linkIds, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.LinkDetailsResponse)
            .PostAsync(
                $"photos/volumes/{volumeId}/links",
                new LinkDetailsRequest(linkIds),
                DriveApiSerializerContext.Default.LinkDetailsRequest,
                cancellationToken)
            .ConfigureAwait(false);
    }

    public async ValueTask<FindDuplicatesResponse> FindDuplicatesAsync(
        VolumeId volumeId,
        IReadOnlyList<ReadOnlyMemory<byte>> nameHashes,
        CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(PhotosApiSerializerContext.Default.FindDuplicatesResponse)
            .PostAsync(
                $"volumes/{volumeId}/photos/duplicates",
                new FindDuplicatesRequest { NameHashes = nameHashes },
                PhotosApiSerializerContext.Default.FindDuplicatesRequest,
                cancellationToken)
            .ConfigureAwait(false);
    }

    public async ValueTask<ApiResponse> AddPhotoTagsAsync(
        VolumeId volumeId,
        LinkId linkId,
        IReadOnlyList<int> tags,
        CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting<ApiResponse>(DriveApiSerializerContext.Default.ApiResponse)
            .PostAsync(
                $"photos/volumes/{volumeId}/links/{linkId}/tags",
                new PhotoTagsRequest { Tags = tags },
                PhotosApiSerializerContext.Default.PhotoTagsRequest,
                cancellationToken)
            .ConfigureAwait(false);
    }

    public async ValueTask<ApiResponse> RemovePhotoTagsAsync(
        VolumeId volumeId,
        LinkId linkId,
        IReadOnlyList<int> tags,
        CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting<ApiResponse>(DriveApiSerializerContext.Default.ApiResponse)
            .DeleteAsync(
                $"photos/volumes/{volumeId}/links/{linkId}/tags",
                new PhotoTagsRequest { Tags = tags },
                PhotosApiSerializerContext.Default.PhotoTagsRequest,
                cancellationToken)
            .ConfigureAwait(false);
    }

    public async ValueTask<ApiResponse> SetPhotoFavoriteAsync(VolumeId volumeId, LinkId linkId, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting<ApiResponse>(DriveApiSerializerContext.Default.ApiResponse)
            .PostAsync($"photos/volumes/{volumeId}/links/{linkId}/favorite", cancellationToken)
            .ConfigureAwait(false);
    }
}
