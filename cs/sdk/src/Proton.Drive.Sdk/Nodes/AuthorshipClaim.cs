using Proton.Cryptography.Pgp;

namespace Proton.Drive.Sdk.Nodes;

internal readonly struct AuthorshipClaim(Author author, IReadOnlyList<PgpPublicKey> keys, ProtonDriveError? keyRetrievalError = null)
{
    public readonly IReadOnlyList<PgpPublicKey> Keys { get; } = keys;

    public Author Author { get; } = author;

    public ProtonDriveError? KeyRetrievalError { get; } = keyRetrievalError;

    public static async ValueTask<AuthorshipClaim> CreateAsync(
        IAccountClient accountClient,
        string? claimedAuthorEmailAddress,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(claimedAuthorEmailAddress))
        {
            return new AuthorshipClaim(Author.Anonymous, []);
        }

        try
        {
            var keys = await accountClient.GetAddressPublicKeysAsync(claimedAuthorEmailAddress, cancellationToken).ConfigureAwait(false);

            return new AuthorshipClaim(new Author { EmailAddress = claimedAuthorEmailAddress }, keys);
        }
        catch (Exception e)
        {
            return new AuthorshipClaim(new Author { EmailAddress = claimedAuthorEmailAddress }, [], e.ToProtonDriveError());
        }
    }

    public PgpKeyRing GetKeyRing(PgpPrivateKey anonymousFallbackKey)
    {
        return Author != Author.Anonymous ? new PgpKeyRing(Keys) : anonymousFallbackKey;
    }
}
