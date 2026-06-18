namespace Proton.Drive.Sdk.Nodes.Download;

public sealed class CompletedDownloadManifestVerificationException : Exception
{
    public CompletedDownloadManifestVerificationException(string message)
        : base(message)
    {
    }

    public CompletedDownloadManifestVerificationException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    public CompletedDownloadManifestVerificationException()
    {
    }
}
