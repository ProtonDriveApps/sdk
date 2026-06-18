using Proton.Drive.Sdk.Nodes.Cryptography;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal static class AuthorshipClaimExtensions
{
    public static Result<Author, SignatureVerificationError> ToAuthorshipResult(
        this AuthorshipClaim authorshipClaim,
        AuthorshipVerificationFailure? verificationFailure)
    {
        if (verificationFailure is not null)
        {
            var error = authorshipClaim.KeyRetrievalError ?? verificationFailure.Value.Error;

            return new SignatureVerificationError(authorshipClaim.Author, verificationFailure.Value.Status, "Authorship failure", error);
        }

        return authorshipClaim.Author;
    }
}
