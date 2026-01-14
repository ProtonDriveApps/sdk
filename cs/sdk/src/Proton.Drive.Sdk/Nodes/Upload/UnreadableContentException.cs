namespace Proton.Drive.Sdk.Nodes.Upload;

public class UnreadableContentException : ProtonDriveException
{
    public UnreadableContentException()
    {
    }

    public UnreadableContentException(string message)
        : base(message)
    {
    }

    public UnreadableContentException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
