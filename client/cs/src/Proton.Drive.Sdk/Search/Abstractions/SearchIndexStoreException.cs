namespace Proton.Drive.Sdk.Search.Abstractions;

public sealed class SearchIndexStoreException : Exception
{
    public SearchIndexStoreException()
    {
    }

    public SearchIndexStoreException(string message)
        : base(message)
    {
    }

    public SearchIndexStoreException(string message, Exception? innerException)
        : base(message, innerException)
    {
    }
}
