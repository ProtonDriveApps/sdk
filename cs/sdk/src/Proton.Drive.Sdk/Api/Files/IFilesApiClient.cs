using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Files;

internal interface IFilesApiClient
{
    ValueTask<FileCreationResponse> CreateFileAsync(VolumeId volumeId, FileCreationRequest request, CancellationToken cancellationToken);

    Task<RevisionCreationResponse> CreateRevisionAsync(VolumeId volumeId, LinkId linkId, RevisionCreationRequest request, CancellationToken cancellationToken);

    ValueTask<BlockUploadPreparationResponse> PrepareBlockUploadAsync(BlockUploadPreparationRequest request, CancellationToken cancellationToken);

    ValueTask<ApiResponse> UpdateRevisionAsync(
        VolumeId volumeId,
        LinkId linkId,
        RevisionId revisionId,
        RevisionUpdateRequest request,
        CancellationToken cancellationToken);

    public ValueTask<RevisionResponse> GetRevisionAsync(
        VolumeId volumeId,
        LinkId linkId,
        RevisionId revisionId,
        int fromBlockIndex,
        int pageSize,
        bool withoutBlockUrls,
        CancellationToken cancellationToken);
}
