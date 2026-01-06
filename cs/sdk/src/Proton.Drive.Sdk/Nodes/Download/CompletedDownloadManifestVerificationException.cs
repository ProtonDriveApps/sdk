namespace Proton.Drive.Sdk.Nodes.Download;

internal sealed class CompletedDownloadManifestVerificationException : Exception
{
    public CompletedDownloadManifestVerificationException(string message)
        : base(message)
    {
    }
}
