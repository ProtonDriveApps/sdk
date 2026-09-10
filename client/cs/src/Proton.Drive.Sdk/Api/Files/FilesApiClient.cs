using System.Net.Http.Headers;
using System.Net.Mime;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization.Metadata;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Serialization;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Api;
using Proton.Sdk.Api.Http;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class FilesApiClient(HttpClient httpClient) : IFilesApiClient
{
    private readonly HttpClient _httpClient = httpClient;

    public async ValueTask<FileCreationResponse> CreateFileAsync(VolumeId volumeId, FileCreationRequest request, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.FileCreationResponse, DriveApiSerializerContext.Default.DetailedApiResponse)
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
            .Expecting(DriveApiSerializerContext.Default.RevisionCreationResponse, DriveApiSerializerContext.Default.DetailedApiResponse)
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
            .Expecting<ApiResponse>(DriveApiSerializerContext.Default.ApiResponse)
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

    public async ValueTask<SmallUploadResponse> UploadSmallFileAsync(
        VolumeId volumeId,
        SmallFileUploadMetadataRequest metadata,
        byte[]? contentBlock,
        IReadOnlyList<EncryptedThumbnail>? thumbnailBlocks,
        CancellationToken cancellationToken)
    {
        return await SendSmallUploadAsync(
            $"v2/volumes/{volumeId}/files/small",
            metadata,
            DriveApiSerializerContext.Default.SmallFileUploadMetadataRequest,
            contentBlock,
            thumbnailBlocks,
            cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<SmallUploadResponse> UploadSmallRevisionAsync(
        VolumeId volumeId,
        LinkId linkId,
        SmallRevisionUploadMetadataRequest metadata,
        byte[]? contentBlock,
        IReadOnlyList<EncryptedThumbnail>? thumbnailBlocks,
        CancellationToken cancellationToken)
    {
        return await SendSmallUploadAsync(
            $"v2/volumes/{volumeId}/files/{linkId}/revisions/small",
            metadata,
            DriveApiSerializerContext.Default.SmallRevisionUploadMetadataRequest,
            contentBlock,
            thumbnailBlocks,
            cancellationToken).ConfigureAwait(false);
    }

    private static MultipartFormDataContent BuildSmallUploadContent<TMetadata>(
        TMetadata metadata,
        JsonTypeInfo<TMetadata> metadataTypeInfo,
        byte[]? contentBlock,
        IReadOnlyList<EncryptedThumbnail>? thumbnailBlocks)
    {
        var multipartContent = new MultipartFormDataContent();

        try
        {
            var metadataJson = JsonSerializer.Serialize(metadata, metadataTypeInfo);
            var metadataContent = new StringContent(metadataJson);
            metadataContent.Headers.ContentDisposition = new ContentDispositionHeaderValue("form-data") { Name = "Metadata", FileName = "Metadata" };
            metadataContent.Headers.ContentType = new MediaTypeHeaderValue(MediaTypeNames.Application.Json);
            multipartContent.Add(metadataContent);

            if (contentBlock is not null)
            {
                var blockContent = new ByteArrayContent(contentBlock);
                blockContent.Headers.ContentDisposition = new ContentDispositionHeaderValue("form-data") { Name = "ContentBlock", FileName = "ContentBlock" };
                blockContent.Headers.ContentType = new MediaTypeHeaderValue(MediaTypeNames.Application.Octet);
                multipartContent.Add(blockContent);
            }

            if (thumbnailBlocks is not null)
            {
                foreach (var (type, data) in thumbnailBlocks)
                {
                    var thumbnailContent = new ByteArrayContent(data);
                    thumbnailContent.Headers.ContentDisposition = new ContentDispositionHeaderValue("form-data")
                    {
                        Name = $"ThumbnailBlockType_{type}",
                        FileName = $"ThumbnailBlockType_{type}",
                    };
                    thumbnailContent.Headers.ContentType = new MediaTypeHeaderValue(MediaTypeNames.Application.Octet);
                    multipartContent.Add(thumbnailContent);
                }
            }

            return multipartContent;
        }
        catch
        {
            multipartContent.Dispose();
            throw;
        }
    }

    private async ValueTask<SmallUploadResponse> SendSmallUploadAsync<TMetadata>(
        string url,
        TMetadata metadata,
        JsonTypeInfo<TMetadata> metadataTypeInfo,
        byte[]? contentBlock,
        IReadOnlyList<EncryptedThumbnail>? thumbnailBlocks,
        CancellationToken cancellationToken)
    {
        using var multipartContent = BuildSmallUploadContent(metadata, metadataTypeInfo, contentBlock, thumbnailBlocks);
        using var requestMessage = HttpRequestMessageFactory.Create(HttpMethod.Post, url, multipartContent);
        requestMessage.SetRequestType(HttpRequestType.StorageUpload);

        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.SmallUploadResponse, DriveApiSerializerContext.Default.DetailedApiResponse)
            .SendAsync(requestMessage, cancellationToken).ConfigureAwait(false);
    }
}
