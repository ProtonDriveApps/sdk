namespace Proton.Drive.Sdk;

public sealed class DataIntegrityException : ProtonDriveException
{
    public DataIntegrityException(string message)
        : base(message)
    {
    }
}
