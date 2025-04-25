namespace Proton.Drive.Sdk.Nodes.Upload.Verification;

public sealed class NodeKeyAndSessionKeyMismatchException : Exception
{
    public NodeKeyAndSessionKeyMismatchException(string message)
        : base(message)
    {
    }

    public NodeKeyAndSessionKeyMismatchException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    public NodeKeyAndSessionKeyMismatchException()
    {
    }

    public NodeKeyAndSessionKeyMismatchException(Exception innerException)
        : base(string.Empty, innerException)
    {
    }
}
