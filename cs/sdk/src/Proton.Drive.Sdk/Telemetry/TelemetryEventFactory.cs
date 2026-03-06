using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Shares;

namespace Proton.Drive.Sdk.Telemetry;

internal static class TelemetryEventFactory
{
    private static readonly DateTime LegacyBoundary = new(2024, 1, 1, 0, 0, 0, 0, 0, DateTimeKind.Utc);

    /// <summary>
    /// Creates DecryptionErrorEvent objects for a degraded node with multiple failed fields.
    /// </summary>
    public static async Task<IEnumerable<DecryptionErrorEvent>> CreateDecryptionErrorEventsAsync(
        ProtonDriveClient client,
        DegradedNodeMetadata degradedNode,
        IEnumerable<EncryptedField> failedFields,
        CancellationToken cancellationToken)
    {
        // FIXME won't work for photos in an album, this will need to be differentiated for photos.
        var share = await ShareOperations.GetContextShareAsync(client, degradedNode, cancellationToken).ConfigureAwait(false);
        var fromBefore2024 = degradedNode.Node.CreationTime.CompareTo(LegacyBoundary) < 1;

        return failedFields.Select(field => new DecryptionErrorEvent
        {
            Uid = degradedNode.Node.Uid.ToString(),
            Field = field,
            VolumeType = VolumeTypeFactory.FromShareType(share.Share.Type),
            FromBefore2024 = fromBefore2024,
            Error = string.Empty,
        }).ToList();
    }

    /// <summary>
    /// Creates a DecryptionErrorEvent for a single field using a node UID.
    /// </summary>
    public static async Task<DecryptionErrorEvent> CreateDecryptionErrorEventAsync(
        ProtonDriveClient client,
        NodeUid nodeUid,
        EncryptedField field,
        DateTime creationTime,
        CancellationToken cancellationToken)
    {
        var nodeResult = await NodeOperations.GetNodeMetadataResultAsync(client, nodeUid, null, cancellationToken).ConfigureAwait(false);
        var share = await ShareOperations.GetContextShareAsync(client, nodeResult, cancellationToken).ConfigureAwait(false);

        return new DecryptionErrorEvent
        {
            Uid = nodeUid.ToString(),
            Field = field,
            VolumeType = VolumeTypeFactory.FromShareType(share.Share.Type),
            FromBefore2024 = creationTime.CompareTo(LegacyBoundary) < 1,
            Error = string.Empty,
        };
    }

    /// <summary>
    /// Creates a VerificationErrorEvent using a node UID.
    /// </summary>
    public static async Task<VerificationErrorEvent> CreateVerificationErrorEventAsync(
        ProtonDriveClient client,
        NodeUid nodeUid,
        EncryptedField field,
        DateTime creationTime,
        CancellationToken cancellationToken)
    {
        var nodeResult = await NodeOperations.GetNodeMetadataResultAsync(client, nodeUid, null, cancellationToken).ConfigureAwait(false);
        var share = await ShareOperations.GetContextShareAsync(client, nodeResult, cancellationToken).ConfigureAwait(false);

        return new VerificationErrorEvent
        {
            Uid = nodeUid.ToString(),
            Field = field,
            VolumeType = VolumeTypeFactory.FromShareType(share.Share.Type),
            FromBefore2024 = creationTime.CompareTo(LegacyBoundary) < 1,
            Error = string.Empty,
        };
    }

    /// <summary>
    /// Creates an UploadEvent with the correct VolumeType for the given node.
    /// </summary>
    public static async Task<UploadEvent> CreateUploadEventAsync(
        ProtonDriveClient client,
        NodeUid nodeUid,
        long expectedSize,
        CancellationToken cancellationToken)
    {
        return new UploadEvent
        {
            ExpectedSize = expectedSize,
            ApproximateExpectedSize = Privacy.ReduceSizePrecision(expectedSize),
            UploadedSize = 0,
            ApproximateUploadedSize = 0,
            VolumeType = await ResolveVolumeTypeAsync(client, nodeUid, cancellationToken).ConfigureAwait(false),
        };
    }

    /// <summary>
    /// Creates a DownloadEvent with the correct VolumeType for the given node.
    /// </summary>
    public static async Task<DownloadEvent> CreateDownloadEventAsync(
        ProtonDriveClient client,
        NodeUid nodeUid,
        CancellationToken cancellationToken)
    {
        return new DownloadEvent
        {
            DownloadedSize = 0,
            VolumeType = await ResolveVolumeTypeAsync(client, nodeUid, cancellationToken).ConfigureAwait(false),
        };
    }

    internal static async Task<VolumeType> ResolveVolumeTypeAsync(
        ProtonDriveClient client,
        NodeUid nodeUid,
        CancellationToken cancellationToken)
    {
        try
        {
            var nodeResult = await NodeOperations.GetNodeMetadataResultAsync(client, nodeUid, null, cancellationToken).ConfigureAwait(false);
            var share = await ShareOperations.GetContextShareAsync(client, nodeResult, cancellationToken).ConfigureAwait(false);

            return VolumeTypeFactory.FromShareType(share.Share.Type);
        }
        catch
        {
            return VolumeType.OwnVolume;
        }
    }
}
