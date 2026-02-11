namespace Proton.Drive.Sdk.Nodes.Upload;

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
        Func<ReadOnlyMemory<byte>>? expectedSha1Provider,
        CancellationToken cancellationToken)
    {
        throw new NotSupportedException();
    }

    public static UploadController UploadFromFile(
        string filePath,
        IEnumerable<Thumbnail> thumbnails,
        Action<long, long>? onProgress,
        Func<ReadOnlyMemory<byte>>? expectedSha1Provider,
        CancellationToken cancellationToken)
    {
        throw new NotSupportedException();
    }

    public void Dispose()
    {
    }
}
