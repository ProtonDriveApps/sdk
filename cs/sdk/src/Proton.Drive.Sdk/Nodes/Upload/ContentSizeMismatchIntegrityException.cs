namespace Proton.Drive.Sdk.Nodes.Upload;

public class ContentSizeMismatchIntegrityException : IntegrityException
{
    public ContentSizeMismatchIntegrityException()
    {
    }

    public ContentSizeMismatchIntegrityException(string message)
        : base(message)
    {
    }

    public ContentSizeMismatchIntegrityException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    public ContentSizeMismatchIntegrityException(long uploadedSize, long expectedSize)
        : base("Mismatch between uploaded size and expected size")
    {
        UploadedSize = uploadedSize;
        ExpectedSize = expectedSize;
    }

    public long? UploadedSize { get; }

    public long? ExpectedSize { get; }
}
