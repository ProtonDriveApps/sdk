using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Files;

namespace Proton.Drive.Sdk.Nodes.Upload.Verification;

internal interface IBlockVerifierFactory
{
    ValueTask<IBlockVerifier> CreateAsync(NodeUid fileUid, RevisionId revisionId, PgpPrivateKey key, CancellationToken cancellationToken);
}
