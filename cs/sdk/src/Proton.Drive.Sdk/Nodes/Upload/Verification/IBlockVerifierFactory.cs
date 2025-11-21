using Proton.Cryptography.Pgp;

namespace Proton.Drive.Sdk.Nodes.Upload.Verification;

internal interface IBlockVerifierFactory
{
    ValueTask<IBlockVerifier> CreateAsync(RevisionUid revisionUid, PgpPrivateKey key, CancellationToken cancellationToken);
}
