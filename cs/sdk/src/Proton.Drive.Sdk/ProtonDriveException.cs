namespace Proton.Drive.Sdk;

public class ProtonDriveException : Exception
{
    public ProtonDriveException(string message)
        : base(message)
    {
    }

    public ProtonDriveException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    public ProtonDriveException()
    {
    }
}
