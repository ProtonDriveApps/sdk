using Proton.Sdk.Api;

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

    public ResponseCode? Code { get; protected init; }
}
