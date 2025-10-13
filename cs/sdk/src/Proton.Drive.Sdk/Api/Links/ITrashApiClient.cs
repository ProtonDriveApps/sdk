using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Links;

internal interface ITrashApiClient
{
    ValueTask<AggregateApiResponse<LinkIdResponsePair>> TrashMultipleAsync(
        VolumeId volumeId,
        MultipleLinksNullaryRequest request,
        CancellationToken cancellationToken);

    ValueTask<AggregateApiResponse<LinkIdResponsePair>> RestoreMultipleAsync(
        VolumeId volumeId,
        MultipleLinksNullaryRequest request,
        CancellationToken cancellationToken);

    ValueTask<AggregateApiResponse<LinkIdResponsePair>> DeleteMultipleAsync(
        VolumeId volumeId,
        MultipleLinksNullaryRequest request,
        CancellationToken cancellationToken);

    ValueTask<ApiResponse> EmptyAsync(VolumeId volumeId, CancellationToken cancellationToken);
}
