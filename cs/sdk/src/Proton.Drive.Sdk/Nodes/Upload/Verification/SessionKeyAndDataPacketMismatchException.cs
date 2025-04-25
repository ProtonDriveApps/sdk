namespace Proton.Drive.Sdk.Nodes.Upload.Verification;

public sealed class SessionKeyAndDataPacketMismatchException : Exception
{
    public SessionKeyAndDataPacketMismatchException(string message)
        : base(message)
    {
    }

    public SessionKeyAndDataPacketMismatchException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    public SessionKeyAndDataPacketMismatchException()
    {
    }
}
