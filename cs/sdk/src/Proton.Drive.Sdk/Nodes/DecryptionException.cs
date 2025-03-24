namespace Proton.Drive.Sdk.Nodes;

public sealed class DecryptionException : Exception
{
    public DecryptionException()
    {
    }

    public DecryptionException(string? message)
        : base(message)
    {
    }

    public DecryptionException(string? message, Exception? innerException)
        : base(message, innerException)
    {
    }

    public DecryptionException(Author claimedAuthor, string? message)
        : this(message)
    {
        ClaimedAuthor = claimedAuthor;
    }

    public Author? ClaimedAuthor { get; }
}
