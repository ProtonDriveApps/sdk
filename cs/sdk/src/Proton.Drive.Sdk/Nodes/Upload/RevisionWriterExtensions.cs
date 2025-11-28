namespace Proton.Drive.Sdk.Nodes.Upload;

internal static class RevisionWriterExtensions
{
    public static ValueTask WriteAsync(
        this RevisionWriter revisionWriter,
        Stream contentStream,
        long expectedContentLength,
        DateTimeOffset? lastModificationTime,
        IEnumerable<AdditionalMetadataProperty>? additionalMetadata,
        Action<long> onProgress,
        CancellationToken cancellationToken)
    {
        return revisionWriter.WriteAsync(contentStream, expectedContentLength, [], lastModificationTime, additionalMetadata, onProgress, cancellationToken);
    }

    public static ValueTask WriteAsync(
        this RevisionWriter revisionWriter,
        Stream contentStream,
        long expectedContentLength,
        DateTime lastModificationTime,
        IEnumerable<AdditionalMetadataProperty>? additionalMetadata,
        Action<long> onProgress,
        CancellationToken cancellationToken)
    {
        return revisionWriter.WriteAsync(
            contentStream,
            expectedContentLength,
            [],
            new DateTimeOffset(lastModificationTime),
            additionalMetadata,
            onProgress,
            cancellationToken);
    }

    public static ValueTask WriteAsync(
        this RevisionWriter revisionWriter,
        Stream contentStream,
        long expectedContentLength,
        IEnumerable<Thumbnail> thumbnails,
        DateTime lastModificationTime,
        IEnumerable<AdditionalMetadataProperty>? additionalMetadata,
        Action<long> onProgress,
        CancellationToken cancellationToken)
    {
        return revisionWriter.WriteAsync(
            contentStream,
            expectedContentLength,
            thumbnails,
            new DateTimeOffset(lastModificationTime),
            additionalMetadata,
            onProgress,
            cancellationToken);
    }

    public static async ValueTask WriteAsync(
        this RevisionWriter writer,
        string targetFilePath,
        DateTime lastModificationTime,
        IEnumerable<AdditionalMetadataProperty>? additionalMetadata,
        Action<long> onProgress,
        CancellationToken cancellationToken)
    {
        var fileStream = File.Open(targetFilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);

        await using (fileStream)
        {
            await WriteAsync(writer, fileStream, fileStream.Length, lastModificationTime, additionalMetadata, onProgress, cancellationToken)
                .ConfigureAwait(false);
        }
    }
}
