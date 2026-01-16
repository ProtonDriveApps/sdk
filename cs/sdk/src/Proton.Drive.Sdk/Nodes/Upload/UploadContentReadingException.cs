namespace Proton.Drive.Sdk.Nodes.Upload;

/// <summary>
/// Exception thrown when reading from the content source for the upload failed.
/// </summary>
/// <remarks>
/// Catching this exception allows handling the case when the content source may be in an indeterminate state that would prevent from reusing it for resuming the upload.
/// </remarks>
public class UploadContentReadingException : ProtonDriveException
{
    public UploadContentReadingException()
    {
    }

    public UploadContentReadingException(string message)
        : base(message)
    {
    }

    public UploadContentReadingException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
