namespace Proton.Drive.Sdk.Nodes;

internal sealed class DecryptionError(string message, Author claimedAuthor, ProtonDriveError? innerError = null)
    : ProtonDriveError(message, innerError)
{
    public Author ClaimedAuthor { get; } = claimedAuthor;
}
