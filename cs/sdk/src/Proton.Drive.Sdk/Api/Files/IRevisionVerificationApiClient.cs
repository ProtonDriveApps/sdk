using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Api.Files;

internal interface IRevisionVerificationApiClient
{
    public ValueTask<BlockVerificationInputResponse> GetVerificationInputAsync(
        VolumeId volumeId,
        LinkId linkId,
        RevisionId revisionId,
        CancellationToken cancellationToken);
}
