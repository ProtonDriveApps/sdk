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

    public async ValueTask<FileCreationResponse> CreateFileAsync(VolumeId volumeId, FileCreationParameters parameters, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.FileCreationResponse, DriveApiSerializerContext.Default.RevisionConflictResponse)
            .PostAsync($"v2/volumes/{volumeId}/files", parameters, DriveApiSerializerContext.Default.FileCreationParameters, cancellationToken)
            .ConfigureAwait(false);
    }

    public async ValueTask<BlockRequestResponse> RequestBlockUploadAsync(BlockUploadRequestParameters parameters, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.BlockRequestResponse)
            .PostAsync("blocks", parameters, DriveApiSerializerContext.Default.BlockUploadRequestParameters, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<ApiResponse> UpdateRevisionAsync(
        VolumeId volumeId,
        LinkId linkId,
        RevisionId revisionId,
        RevisionUpdateParameters parameters,
        CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(ProtonApiSerializerContext.Default.ApiResponse)
            .PutAsync(
                $"v2/volumes/{volumeId}/files/{linkId}/revisions/{revisionId}",
                parameters,
                DriveApiSerializerContext.Default.RevisionUpdateParameters,
                cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<BlockVerificationInputResponse> GetVerificationInputAsync(
        VolumeId volumeId,
        LinkId linkId,
        RevisionId revisionId,
        CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.BlockVerificationInputResponse)
            .GetAsync($"v2/volumes/{volumeId}/links/{linkId}/revisions/{revisionId}/verification", cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<RevisionResponse> GetRevisionAsync(
        VolumeId volumeId,
        LinkId linkId,
        RevisionId revisionId,
        int fromBlockIndex,
        int pageSize,
        bool withoutBlockUrls,
        CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.RevisionResponse)
            .GetAsync(
                $"v2/volumes/{volumeId}/files/{linkId}/revisions/{revisionId}?FromBlockIndex={fromBlockIndex}&PageSize={pageSize}&NoBlockUrls={(withoutBlockUrls ? 1 : 0)}",
                cancellationToken).ConfigureAwait(false);
    }
}
