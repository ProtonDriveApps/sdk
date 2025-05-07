namespace Proton.Drive.Sdk.Nodes.Download;

public sealed class FileContentsDecryptionException : ProtonDriveException
{
    public FileContentsDecryptionException()
    {
    }

    public FileContentsDecryptionException(string message)
        : base(message)
    {
    }

    public FileContentsDecryptionException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    public FileContentsDecryptionException(Exception innerException)
        : this("Failed to decrypt file contents", innerException)
    {
    }
}
