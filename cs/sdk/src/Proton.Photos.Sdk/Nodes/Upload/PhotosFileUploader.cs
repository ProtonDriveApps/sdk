using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Nodes.Upload;

namespace Proton.Photos.Sdk.Nodes.Upload;

public sealed class PhotosFileUploader : IDisposable
{
    internal PhotosFileUploader(long fileSize)
    {
        FileSize = fileSize;
    }

    public long FileSize { get; }

    public static UploadController UploadFromStream(
        System.IO.Stream contentStream,
        IEnumerable<Thumbnail> thumbnails,
        Action<long, long>? onProgress,
        CancellationToken cancellationToken)
    {
        throw new NotSupportedException();
    }

    public static UploadController UploadFromFile(
        string filePath,
        IEnumerable<Thumbnail> thumbnails,
        Action<long, long>? onProgress,
        CancellationToken cancellationToken)
    {
        throw new NotSupportedException();
    }

    public void Dispose()
    {
    }
}
