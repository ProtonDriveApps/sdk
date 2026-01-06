namespace Proton.Drive.Sdk.Nodes.Download;

public sealed class DataIntegrityException : ProtonDriveException
{
    public DataIntegrityException(string message)
        : base(message)
    {
    }
}
