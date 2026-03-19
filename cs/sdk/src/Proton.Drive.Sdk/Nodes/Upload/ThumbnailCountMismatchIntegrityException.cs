namespace Proton.Drive.Sdk.Nodes.Upload;

public class ThumbnailCountMismatchIntegrityException : IntegrityException
{
    public ThumbnailCountMismatchIntegrityException()
    {
    }

    public ThumbnailCountMismatchIntegrityException(string message)
        : base(message)
    {
    }

    public ThumbnailCountMismatchIntegrityException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    public ThumbnailCountMismatchIntegrityException(int uploadedBlockCount, int expectedBlockCount)
        : base("Some file parts failed to upload")
    {
        UploadedBlockCount = uploadedBlockCount;
        ExpectedBlockCount = expectedBlockCount;
    }

    public int? UploadedBlockCount { get; }

    public int? ExpectedBlockCount { get; }
}
