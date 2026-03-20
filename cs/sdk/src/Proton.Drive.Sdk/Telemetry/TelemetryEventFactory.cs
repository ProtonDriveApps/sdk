using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Telemetry;

internal static class TelemetryEventFactory
{
    private static readonly DateTime LegacyBoundary = new(2024, 1, 1, 0, 0, 0, 0, 0, DateTimeKind.Utc);

    /// <summary>
    /// Creates DecryptionErrorEvent objects for a degraded node with multiple failed fields.
    /// </summary>
    public static async Task<IEnumerable<DecryptionErrorEvent>> CreateDecryptionErrorEventsAsync(
        ProtonDriveClient client,
        DegradedNode degradedNode,
        IEnumerable<EncryptedField> failedFields,
        CancellationToken cancellationToken)
    {
        var fromBefore2024 = degradedNode.CreationTime.CompareTo(LegacyBoundary) < 1;

        var volumeType = await ResolveVolumeTypeAsync(client, degradedNode.Uid, cancellationToken).ConfigureAwait(false);

        return failedFields.Select(field => new DecryptionErrorEvent
        {
            Uid = degradedNode.Uid,
            Field = field,
            VolumeType = volumeType,
            FromBefore2024 = fromBefore2024,
        });
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
        return new DecryptionErrorEvent
        {
            Uid = nodeUid,
            Field = field,
            VolumeType = await ResolveVolumeTypeAsync(client, nodeUid, cancellationToken).ConfigureAwait(false),
            FromBefore2024 = creationTime.CompareTo(LegacyBoundary) < 1,
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
        return new VerificationErrorEvent
        {
            Uid = nodeUid,
            Field = field,
            VolumeType = await ResolveVolumeTypeAsync(client, nodeUid, cancellationToken).ConfigureAwait(false),
            FromBefore2024 = creationTime.CompareTo(LegacyBoundary) < 1,
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
            var mainVolumeId = await VolumeOperations.TryGetMainVolumeIdAsync(client, cancellationToken).ConfigureAwait(false);

            if (mainVolumeId is not null && nodeUid.VolumeId == mainVolumeId)
            {
                return VolumeType.OwnVolume;
            }

            var photosVolumeId = await VolumeOperations.TryGetPhotosVolumeIdAsync(client, cancellationToken).ConfigureAwait(false);

            if (photosVolumeId is not null && nodeUid.VolumeId == photosVolumeId)
            {
                return VolumeType.OwnPhotosVolume;
            }

            return VolumeType.Shared;
        }
        catch
        {
            return VolumeType.Unknown;
        }
    }
}
