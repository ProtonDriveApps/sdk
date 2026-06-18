namespace Proton.Drive.Sdk.Nodes.Upload.Verification;

public sealed class SessionKeyAndDataPacketMismatchException : IntegrityException
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

    public SessionKeyAndDataPacketMismatchException(Exception innerException)
        : base(string.Empty, innerException)
    {
    }
}
