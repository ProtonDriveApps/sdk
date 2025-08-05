namespace Proton.Drive.Sdk.Nodes.Upload;

internal static class RevisionWriterExtensions
{
    public static ValueTask WriteAsync(
        this RevisionWriter revisionWriter,
        Stream contentStream,
        DateTimeOffset? lastModificationTime,
        Action<long, long> onProgress,
        CancellationToken cancellationToken)
    {
        return revisionWriter.WriteAsync(contentStream, [], lastModificationTime, onProgress, cancellationToken);
    }

    public static ValueTask WriteAsync(
        this RevisionWriter revisionWriter,
        Stream contentStream,
        DateTime lastModificationTime,
        Action<long, long> onProgress,
        CancellationToken cancellationToken)
    {
        return revisionWriter.WriteAsync(contentStream, [], new DateTimeOffset(lastModificationTime), onProgress, cancellationToken);
    }

    public static ValueTask WriteAsync(
        this RevisionWriter revisionWriter,
        Stream contentStream,
        IEnumerable<Thumbnail> thumbnails,
        DateTime lastModificationTime,
        Action<long, long> onProgress,
        CancellationToken cancellationToken)
    {
        return revisionWriter.WriteAsync(contentStream, thumbnails, new DateTimeOffset(lastModificationTime), onProgress, cancellationToken);
    }

    public static async ValueTask WriteAsync(
        this RevisionWriter writer,
        string targetFilePath,
        DateTime lastModificationTime,
        Action<long, long> onProgress,
        CancellationToken cancellationToken)
    {
        var fileStream = File.Open(targetFilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);

        await using (fileStream)
        {
            await WriteAsync(writer, fileStream, lastModificationTime, onProgress, cancellationToken).ConfigureAwait(false);
        }
    }
}
