using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.BlockVerification;
using Proton.Drive.Sdk.Api.Files;

namespace Proton.Drive.Sdk.Nodes.Upload.Verification;

internal sealed class BlockVerifierFactory(HttpClient httpClient) : IBlockVerifierFactory
{
    private readonly IRevisionVerificationApiClient _apiClient = new RevisionVerificationApiClient(httpClient);

    public async ValueTask<IBlockVerifier> CreateAsync(
        NodeUid fileUid,
        RevisionId revisionId,
        PgpPrivateKey key,
        CancellationToken cancellationToken)
    {
        return await BlockVerifier.CreateAsync(_apiClient, fileUid, revisionId, key, cancellationToken).ConfigureAwait(false);
    }
}
