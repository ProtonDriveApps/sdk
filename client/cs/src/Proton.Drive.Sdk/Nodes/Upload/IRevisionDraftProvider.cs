namespace Proton.Drive.Sdk.Nodes.Upload;

internal interface IRevisionDraftProvider
{
    ValueTask<RevisionDraft> GetDraftAsync(
        long intendedUploadSize,
        IEnumerable<Thumbnail> thumbnails,
        bool contentCanSeek,
        bool allowSmallUpload,
        CancellationToken cancellationToken);
}
