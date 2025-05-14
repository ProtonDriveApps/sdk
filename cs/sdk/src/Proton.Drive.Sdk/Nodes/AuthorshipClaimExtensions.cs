using Proton.Drive.Sdk.Nodes.Cryptography;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal static class AuthorshipClaimExtensions
{
    public static ValResult<Author, SignatureVerificationError> ToAuthorshipResult(
        this AuthorshipClaim authorshipClaim,
        AuthorshipVerificationFailure? verificationFailure)
    {
        if (verificationFailure is not null)
        {
            var errorMessage = authorshipClaim.KeyRetrievalErrorMessage ?? verificationFailure.Value.Message;

            return new SignatureVerificationError(authorshipClaim.Author, verificationFailure.Value.Status, errorMessage);
        }

        return authorshipClaim.Author;
    }
}
