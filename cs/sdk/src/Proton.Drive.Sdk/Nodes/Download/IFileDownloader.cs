namespace Proton.Drive.Sdk.Nodes.Download;

public interface IFileDownloader : IDisposable
{
    DownloadController DownloadToStream(Stream contentOutputStream, Action<long, long> onProgress, CancellationToken cancellationToken);

    DownloadController DownloadToFile(string filePath, Action<long, long> onProgress, CancellationToken cancellationToken);
}
