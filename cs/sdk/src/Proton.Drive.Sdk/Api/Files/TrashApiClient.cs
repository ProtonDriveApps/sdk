using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Volumes;
using Proton.Drive.Sdk.Serialization;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Api;
using Proton.Sdk.Http;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class TrashApiClient(HttpClient httpClient) : ITrashApiClient
{
    private readonly HttpClient _httpClient = httpClient;

    public async ValueTask<VolumeTrashResponse> GetTrashAsync(VolumeId volumeId, int pageSize, int page, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.VolumeTrashResponse)
            .GetAsync($"volumes/{volumeId}/trash?pageSize={pageSize}&page={page}", cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<AggregateApiResponse<LinkIdResponsePair>> TrashMultipleAsync(
        VolumeId volumeId,
        MultipleLinksNullaryRequest request,
        CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.AggregateApiResponseLinkIdResponsePair)
            .PostAsync($"v2/volumes/{volumeId}/trash_multiple", request, DriveApiSerializerContext.Default.MultipleLinksNullaryRequest, cancellationToken)
            .ConfigureAwait(false);
    }

    public async ValueTask<AggregateApiResponse<LinkIdResponsePair>> DeleteMultipleAsync(
        VolumeId volumeId,
        MultipleLinksNullaryRequest request,
        CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.AggregateApiResponseLinkIdResponsePair)
            .PostAsync(
                $"v2/volumes/{volumeId}/trash/delete_multiple",
                request,
                DriveApiSerializerContext.Default.MultipleLinksNullaryRequest,
                cancellationToken)
            .ConfigureAwait(false);
    }

    public async ValueTask<AggregateApiResponse<LinkIdResponsePair>> RestoreMultipleAsync(
        VolumeId volumeId,
        MultipleLinksNullaryRequest request,
        CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.AggregateApiResponseLinkIdResponsePair)
            .PutAsync(
                $"v2/volumes/{volumeId}/trash/restore_multiple",
                request,
                DriveApiSerializerContext.Default.MultipleLinksNullaryRequest,
                cancellationToken)
            .ConfigureAwait(false);
    }

    public async ValueTask<ApiResponse> EmptyAsync(VolumeId volumeId, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(ProtonApiSerializerContext.Default.ApiResponse)
            .DeleteAsync("volumes/trash", cancellationToken).ConfigureAwait(false);
    }
}
