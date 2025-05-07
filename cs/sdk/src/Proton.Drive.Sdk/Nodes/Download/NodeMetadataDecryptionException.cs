namespace Proton.Drive.Sdk.Nodes.Download;

public sealed class NodeMetadataDecryptionException : Exception
{
    public NodeMetadataDecryptionException()
    {
    }

    public NodeMetadataDecryptionException(string message)
        : base(message)
    {
    }

    public NodeMetadataDecryptionException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    internal NodeMetadataDecryptionException(NodeMetadataPart part, Exception innerException)
        : base($"Failed to decrypt node metadata: {part.ToString()}", innerException)
    {
        Part = part;
    }

    internal NodeMetadataPart Part { get; }
}
