namespace Proton.Drive.Sdk;

internal sealed class CompletedDownloadManifestVerificationException : Exception
{
    public CompletedDownloadManifestVerificationException(string message)
        : base(message)
    {
    }
}
