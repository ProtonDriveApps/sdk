using System.Text;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Serialization;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Api;
using Proton.Sdk.Http;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class FilesApiClient(HttpClient httpClient) : IFilesApiClient
{
    private readonly HttpClient _httpClient = httpClient;

    public async ValueTask<FileCreationResponse> CreateFileAsync(VolumeId volumeId, FileCreationRequest request, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.FileCreationResponse, DriveApiSerializerContext.Default.RevisionConflictResponse)
            .PostAsync($"v2/volumes/{volumeId}/files", request, DriveApiSerializerContext.Default.FileCreationRequest, cancellationToken)
            .ConfigureAwait(false);
    }

    public async ValueTask<RevisionCreationResponse> CreateRevisionAsync(
        VolumeId volumeId,
        LinkId linkId,
        RevisionCreationRequest request,
        CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.RevisionCreationResponse, DriveApiSerializerContext.Default.RevisionConflictResponse)
            .PostAsync(
                $"v2/volumes/{volumeId}/files/{linkId}/revisions",
                request,
                DriveApiSerializerContext.Default.RevisionCreationRequest,
                cancellationToken)
            .ConfigureAwait(false);
    }

    public async ValueTask<BlockUploadPreparationResponse> PrepareBlockUploadAsync(BlockUploadPreparationRequest request, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.BlockUploadPreparationResponse)
            .PostAsync("blocks", request, DriveApiSerializerContext.Default.BlockUploadPreparationRequest, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<ApiResponse> UpdateRevisionAsync(
        VolumeId volumeId,
        LinkId linkId,
        RevisionId revisionId,
        RevisionUpdateRequest request,
        CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(ProtonApiSerializerContext.Default.ApiResponse)
            .PutAsync(
                $"v2/volumes/{volumeId}/files/{linkId}/revisions/{revisionId}",
                request,
                DriveApiSerializerContext.Default.RevisionUpdateRequest,
                cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<RevisionResponse> GetRevisionAsync(
        VolumeId volumeId,
        LinkId linkId,
        RevisionId revisionId,
        int? fromBlockIndex,
        int? pageSize,
        bool withoutBlockUrls,
        CancellationToken cancellationToken)
    {
        var routeBuilder = new StringBuilder();

        routeBuilder.Append($"v2/volumes/{volumeId}/files/{linkId}/revisions/{revisionId}?");

        if (fromBlockIndex is not null)
        {
            routeBuilder.Append($"FromBlockIndex={fromBlockIndex}&");
        }

        if (pageSize is not null)
        {
            routeBuilder.Append($"PageSize={pageSize}&");
        }

        routeBuilder.Append($"NoBlockUrls={(withoutBlockUrls ? 1 : 0)}");

        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.RevisionResponse)
            .GetAsync(routeBuilder.ToString(), cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<ApiResponse> DeleteRevisionAsync(VolumeId volumeId, LinkId linkId, RevisionId revisionId, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.ApiResponse)
            .DeleteAsync($"v2/volumes/{volumeId}/files/{linkId}/revisions/{revisionId}", cancellationToken)
            .ConfigureAwait(false);
    }

    public async ValueTask<ThumbnailBlockListResponse> GetThumbnailBlocksAsync(
        VolumeId volumeId,
        IEnumerable<string> thumbnailIds,
        CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.ThumbnailBlockListResponse)
            .PostAsync(
                $"volumes/{volumeId}/thumbnails",
                new ThumbnailBlockListRequest { ThumbnailIds = thumbnailIds },
                DriveApiSerializerContext.Default.ThumbnailBlockListRequest,
                cancellationToken)
            .ConfigureAwait(false);
    }
}
