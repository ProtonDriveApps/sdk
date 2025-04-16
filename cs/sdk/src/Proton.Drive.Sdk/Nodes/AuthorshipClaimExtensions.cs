using Proton.Cryptography.Pgp;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal static class AuthorshipClaimExtensions
{
    public static Result<Author, SignatureVerificationError> ToAuthorshipResult(
        this AuthorshipClaim authorshipClaim,
        PgpVerificationResult verificationResult)
    {
        return verificationResult.Status is PgpVerificationStatus.Ok
            ? authorshipClaim.Author
            : new SignatureVerificationError(authorshipClaim.Author, verificationResult.Status, authorshipClaim.KeyRetrievalErrorMessage);
    }
}
