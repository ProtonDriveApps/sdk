using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Serialization;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Http;

namespace Proton.Drive.Sdk.Api.BlockVerification;

internal sealed class RevisionVerificationApiClient(HttpClient httpClient) : IRevisionVerificationApiClient
{
    private readonly HttpClient _httpClient = httpClient;

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
}
