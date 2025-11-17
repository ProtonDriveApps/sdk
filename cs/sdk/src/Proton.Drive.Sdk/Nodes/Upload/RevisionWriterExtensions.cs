namespace Proton.Drive.Sdk.Nodes.Upload;

internal static class RevisionWriterExtensions
{
    public static ValueTask WriteAsync(
        this RevisionWriter revisionWriter,
        Stream contentStream,
        DateTimeOffset? lastModificationTime,
        IEnumerable<AdditionalMetadataProperty>? additionalMetadata,
        Action<long, long> onProgress,
        CancellationToken cancellationToken)
    {
        return revisionWriter.WriteAsync(contentStream, [], lastModificationTime, additionalMetadata, onProgress, cancellationToken);
    }

    public static ValueTask WriteAsync(
        this RevisionWriter revisionWriter,
        Stream contentStream,
        DateTime lastModificationTime,
        IEnumerable<AdditionalMetadataProperty>? additionalMetadata,
        Action<long, long> onProgress,
        CancellationToken cancellationToken)
    {
        return revisionWriter.WriteAsync(contentStream, [], new DateTimeOffset(lastModificationTime), additionalMetadata, onProgress, cancellationToken);
    }

    public static ValueTask WriteAsync(
        this RevisionWriter revisionWriter,
        Stream contentStream,
        IEnumerable<Thumbnail> thumbnails,
        DateTime lastModificationTime,
        IEnumerable<AdditionalMetadataProperty>? additionalMetadata,
        Action<long, long> onProgress,
        CancellationToken cancellationToken)
    {
        return revisionWriter.WriteAsync(contentStream, thumbnails, new DateTimeOffset(lastModificationTime), additionalMetadata, onProgress, cancellationToken);
    }

    public static async ValueTask WriteAsync(
        this RevisionWriter writer,
        string targetFilePath,
        DateTime lastModificationTime,
        IEnumerable<AdditionalMetadataProperty>? additionalMetadata,
        Action<long, long> onProgress,
        CancellationToken cancellationToken)
    {
        var fileStream = File.Open(targetFilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);

        await using (fileStream)
        {
            await WriteAsync(writer, fileStream, lastModificationTime, additionalMetadata, onProgress, cancellationToken).ConfigureAwait(false);
        }
    }
}
