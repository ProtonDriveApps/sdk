using Proton.Sdk.Drive;

namespace Proton.Drive.Sdk.Nodes.Upload;

public static class RevisionWriterExtensions
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
        IEnumerable<FileSample> samples,
        DateTime lastModificationTime,
        Action<long, long> onProgress,
        CancellationToken cancellationToken)
    {
        return revisionWriter.WriteAsync(contentStream, samples, new DateTimeOffset(lastModificationTime), onProgress, cancellationToken);
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
