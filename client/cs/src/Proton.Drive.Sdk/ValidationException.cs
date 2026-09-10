namespace Proton.Drive.Sdk;

public class ValidationException : ProtonDriveException
{
    public ValidationException()
    {
    }

    public ValidationException(string? message)
        : base(message)
    {
    }

    public ValidationException(string? message, Exception? innerException)
        : base(message, innerException)
    {
    }

    public ValidationException(string? message, Exception? innerException, int? code)
        : base(message, innerException)
    {
        Code = code;
    }

    public int? Code { get; }
}
