namespace Proton.Drive.Sdk.Nodes.Download;

public sealed class DataIntegrityException : ProtonDriveException
{
    public DataIntegrityException()
    {
    }

    public DataIntegrityException(string message)
        : base(message)
    {
    }

    public DataIntegrityException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
