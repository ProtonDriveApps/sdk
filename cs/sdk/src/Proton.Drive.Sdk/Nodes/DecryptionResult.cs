using Proton.Cryptography.Pgp;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal static class DecryptionResult<TData>
{
    public static Result<SessionKeyAndData<TData>, DecryptionError> Success(PgpSessionKey sessionKey, TData data, Author author)
    {
        return new SessionKeyAndData<TData>(sessionKey, (data, author));
    }

    public static Result<SessionKeyAndData<TData>, DecryptionError> AuthorVerificationFailure(
        PgpSessionKey sessionKey,
        TData data,
        Author claimedAuthor,
        string? errorMessage)
    {
        return new SessionKeyAndData<TData>(sessionKey, (data, new SignatureVerificationError(claimedAuthor, errorMessage)));
    }

    public static Result<SessionKeyAndData<TData>, DecryptionError> KeyDecryptionFailure(string errorMessage, Author claimedAuthor)
    {
        return new DecryptionError(errorMessage, claimedAuthor);
    }

    public static Result<SessionKeyAndData<TData>, DecryptionError> DataDecryptionFailure(
        PgpSessionKey sessionKey,
        string errorMessage,
        Author claimedAuthor)
    {
        return new SessionKeyAndData<TData>(sessionKey, new DecryptionError(errorMessage, claimedAuthor));
    }
}
