namespace Proton.Drive.Sdk.Api.Links;

internal enum LinkState
{
    /// <summary>
    /// File is created, waiting for the revision to be committed.
    /// Automatically garbage collected if no blocks uploaded within last 3 hours.
    /// </summary>
    Draft = 0,

    /// <summary>
    /// Active
    /// </summary>
    Active = 1,

    /// <summary>
    /// Trashed
    /// </summary>
    Trashed = 2,

    /// <summary>
    /// Permanently deleted, waiting for the garbage collection.
    /// Should not appear in API responses.
    /// </summary>
    Deleted = 3,

    /// <summary>
    /// Hidden, being restored from old volume.
    /// Should not appear in API responses.
    /// </summary>
    Restoring = 4,
}
