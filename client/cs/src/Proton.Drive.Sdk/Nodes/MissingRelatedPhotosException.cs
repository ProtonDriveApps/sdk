namespace Proton.Drive.Sdk.Nodes;

/// <summary>
/// Raised when the server rejects saving a photo because related photos it requires were not included.
/// Mirrors the JS <c>MissingRelatedPhotosError</c>; the save is retried once with the reported related photos.
/// </summary>
public sealed class MissingRelatedPhotosException : ProtonDriveException
{
    public MissingRelatedPhotosException()
    {
    }

    public MissingRelatedPhotosException(string message)
        : base(message)
    {
    }

    public MissingRelatedPhotosException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    internal MissingRelatedPhotosException(IReadOnlyList<NodeUid> missingNodeUids)
        : base($"The photo cannot be saved without {missingNodeUids.Count} related photo(s)")
    {
        MissingNodeUids = missingNodeUids;
    }

    public IReadOnlyList<NodeUid> MissingNodeUids { get; } = [];
}
