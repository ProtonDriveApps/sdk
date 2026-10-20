namespace Proton.Drive.Sdk.Search;

/// <summary>
/// Thrown when a search operation fails.
/// </summary>
public sealed class SearchException : ProtonDriveException
{
    public SearchException()
    {
    }

    public SearchException(string message)
        : base(message)
    {
    }

    public SearchException(string message, Exception? innerException)
        : base(message, innerException)
    {
    }

    public SearchException(ProtonDriveError error)
        : base(error.Message)
    {
        Error = error;
    }

    public ProtonDriveError? Error { get; }
}
