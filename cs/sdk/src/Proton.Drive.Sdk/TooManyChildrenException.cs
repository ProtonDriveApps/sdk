namespace Proton.Drive.Sdk;

public sealed class TooManyChildrenException : ProtonDriveException
{
    public TooManyChildrenException(string message)
        : base(message)
    {
    }

    public TooManyChildrenException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    public TooManyChildrenException()
    {
    }
}
