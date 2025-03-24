namespace Proton.Drive.Sdk.Nodes;

internal class DecryptionError(string message, Author claimedAuthor)
    : Error(message)
{
    public Author ClaimedAuthor { get; } = claimedAuthor;

    public DecryptionException ToException()
    {
        return new DecryptionException(ClaimedAuthor, Message);
    }
}
