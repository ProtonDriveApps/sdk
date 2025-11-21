using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.BlockVerification;

namespace Proton.Drive.Sdk.Nodes.Upload.Verification;

internal sealed class BlockVerifierFactory(HttpClient httpClient) : IBlockVerifierFactory
{
    private readonly IBlockVerificationApiClient _apiClient = new BlockVerificationApiClient(httpClient);

    public async ValueTask<IBlockVerifier> CreateAsync(
        RevisionUid revisionUid,
        PgpPrivateKey key,
        CancellationToken cancellationToken)
    {
        return await BlockVerifier.CreateAsync(_apiClient, revisionUid, key, cancellationToken).ConfigureAwait(false);
    }
}
