using Proton.Drive.Sdk.Api.Volumes;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Links;

internal interface ITrashApiClient
{
    ValueTask<VolumeTrashResponse> GetTrashAsync(VolumeId volumeId, int pageSize, int pageIndex, CancellationToken cancellationToken);

    ValueTask<AggregateApiResponse<LinkIdResponsePair<ApiResponse>>> TrashMultipleAsync(
        VolumeId volumeId,
        MultipleLinksNullaryRequest request,
        CancellationToken cancellationToken);

    ValueTask<AggregateApiResponse<LinkIdResponsePair<ApiResponse>>> RestoreMultipleAsync(
        VolumeId volumeId,
        MultipleLinksNullaryRequest request,
        CancellationToken cancellationToken);

    ValueTask<AggregateApiResponse<LinkIdResponsePair<ApiResponse>>> DeleteMultipleAsync(
        VolumeId volumeId,
        MultipleLinksNullaryRequest request,
        CancellationToken cancellationToken);

    ValueTask<ApiResponse> EmptyAsync(VolumeId volumeId, CancellationToken cancellationToken);
}
