namespace Proton.Drive.Sdk.Nodes;

public sealed class SignatureVerificationError(Author claimedAuthor, string? message = null)
    : Error(message)
{
    public Author ClaimedAuthor { get; } = claimedAuthor;
}
