namespace Proton.Drive.Sdk.Nodes.Upload;

public class IntegrityException : Exception
{
    public IntegrityException(string message)
        : base(message)
    {
    }

    public IntegrityException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    public IntegrityException()
    {
    }
}
