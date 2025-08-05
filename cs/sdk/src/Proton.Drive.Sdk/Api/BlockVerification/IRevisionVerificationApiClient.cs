using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Api.BlockVerification;

internal interface IRevisionVerificationApiClient
{
    public ValueTask<BlockVerificationInputResponse> GetVerificationInputAsync(
        VolumeId volumeId,
        LinkId linkId,
        RevisionId revisionId,
        CancellationToken cancellationToken);
}
