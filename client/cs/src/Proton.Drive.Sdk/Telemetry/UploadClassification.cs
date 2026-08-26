namespace Proton.Drive.Sdk.Telemetry;

/// <summary>
/// Classifies a completed upload for the per-file upload performance metrics. Kept out of the upload pipeline
/// so that the boundaries live in one place rather than in each caller.
/// </summary>
internal static class UploadClassification
{
    // The boundary comes from the per-file upload performance metrics: below it the small upload route applies,
    // above it the block route does. Classification uses the exact encrypted size, not a privacy-reduced one,
    // so sizes just above the boundary are not pushed back into Small.
    //
    // The block-count boundaries below (single: one block, few: 2-4, many: > 4) correspond to megabyte figures
    // (<= 4 MB, <= 16 MB, > 16 MB) only under the default 4 MiB target block size. Classification deliberately
    // follows the actual block structure, because round trips are what the buckets are tuned for; if
    // ProtonDriveClient.TargetBlockSize ever changes, the equivalent megabyte boundaries change with it.
    private const long SmallSizeLimit = 128 * 1024;

    /// <summary>
    /// Groups an upload by content size, for the active time share metric.
    /// </summary>
    public static UploadSizeClass GetSizeClass(long exactEncryptedContentSize, int contentBlockCount)
    {
        if (contentBlockCount > 1)
        {
            return UploadSizeClass.Multi;
        }

        return exactEncryptedContentSize < SmallSizeLimit ? UploadSizeClass.Small : UploadSizeClass.Single;
    }

    /// <summary>
    /// Groups an upload by block structure, for the throughput metric. Independent of the size class: this one
    /// separates a one-shot upload from pipelined blocks.
    /// </summary>
    public static UploadBlockCount GetBlockCount(int contentBlockCount)
    {
        if (contentBlockCount > 4)
        {
            return UploadBlockCount.Many;
        }

        return contentBlockCount > 1 ? UploadBlockCount.Few : UploadBlockCount.Single;
    }
}
