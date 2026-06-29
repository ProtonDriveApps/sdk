namespace Proton.Drive.Sdk;

public class ValidationException : ProtonDriveException
{
    public ValidationException()
    {
    }

    public ValidationException(string message)
        : base(message)
    {
    }

    public ValidationException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    public int? Code { get; protected init; }
}
