namespace Proton.Drive.Sdk.Nodes.Upload;

public class ChecksumMismatchIntegrityException : IntegrityException
{
    public ChecksumMismatchIntegrityException()
    {
    }

    public ChecksumMismatchIntegrityException(string message)
        : base(message)
    {
    }

    public ChecksumMismatchIntegrityException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    public ChecksumMismatchIntegrityException(byte[]? actualChecksum, byte[]? expectedChecksum)
        : base("Mismatch between uploaded checksum and expected checksum")
    {
        ActualChecksum = actualChecksum;
        ExpectedChecksum = expectedChecksum;
    }

    public byte[]? ActualChecksum { get; }

    public byte[]? ExpectedChecksum { get; }
}
