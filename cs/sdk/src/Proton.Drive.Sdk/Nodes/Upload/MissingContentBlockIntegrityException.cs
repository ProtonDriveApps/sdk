namespace Proton.Drive.Sdk.Nodes.Upload;

public class MissingContentBlockIntegrityException : IntegrityException
{
    public MissingContentBlockIntegrityException()
    {
    }

    public MissingContentBlockIntegrityException(string message)
        : base(message)
    {
    }

    public MissingContentBlockIntegrityException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    public MissingContentBlockIntegrityException(int blockNumber)
        : base($"Missing content block #{blockNumber}")
    {
        BlockNumber = blockNumber;
    }

    public int? BlockNumber { get; }
}
