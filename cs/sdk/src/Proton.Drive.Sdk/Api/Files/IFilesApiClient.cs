using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Files;

internal interface IFilesApiClient : IRevisionVerificationApiClient
{
    ValueTask<FileCreationResponse> CreateFileAsync(VolumeId volumeId, FileCreationParameters parameters, CancellationToken cancellationToken);

    ValueTask<BlockRequestResponse> RequestBlockUploadAsync(BlockUploadRequestParameters parameters, CancellationToken cancellationToken);

    ValueTask<ApiResponse> UpdateRevisionAsync(
        VolumeId volumeId,
        LinkId linkId,
        RevisionId revisionId,
        RevisionUpdateParameters parameters,
        CancellationToken cancellationToken);
}
