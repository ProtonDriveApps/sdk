using System.Text.Json.Serialization;
using Proton.Cryptography.Pgp;

namespace Proton.Drive.Sdk.Nodes;

[method: JsonConstructor]
public sealed class SignatureVerificationError(Author claimedAuthor, string? message = null)
    : ProtonDriveError(message)
{
    public SignatureVerificationError(Author claimedAuthor, PgpVerificationStatus? verificationStatus = null, string? message = null)
        : this(claimedAuthor, GetMessage(verificationStatus, message))
    {
    }

    public Author ClaimedAuthor { get; } = claimedAuthor;

    private static string GetMessage(PgpVerificationStatus? verificationStatus, string? message)
    {
        if (!string.IsNullOrEmpty(message))
        {
            return message;
        }

        return verificationStatus is not null
            ? $"Verification resulted in unsuccessful status: {verificationStatus}"
            : "Authorship could not be verified";
    }
}
