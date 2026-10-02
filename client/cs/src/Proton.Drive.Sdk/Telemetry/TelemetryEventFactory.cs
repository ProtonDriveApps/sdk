using Microsoft.Extensions.Logging;
using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Telemetry;

internal static class TelemetryEventFactory
{
    private static readonly DateTime Since2024Boundary = new(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    /// <summary>
    /// Creates DecryptionErrorEvent objects for a degraded node with multiple failed fields.
    /// </summary>
    public static IEnumerable<DecryptionErrorEvent> CreateDecryptionErrorEvents(
        NodeUid nodeUid,
        LinkDto link,
        ActiveRevisionDto? activeRevision,
        IReadOnlyDictionary<EncryptedField, ProtonDriveError> failedFields)
    {
        return failedFields.Select(field =>
        {
            var (creationTime, thirdParty, sdk) = GetItemContext(field.Key, link, activeRevision);
            return new DecryptionErrorEvent
            {
                Uid = nodeUid,
                Field = field.Key,
                Recency = GetRecency(creationTime, DateTime.UtcNow),
                CreatedBy = GetCreator(thirdParty, sdk),
                Error = field.Value.FlattenMessage(),
            };
        });
    }

    /// <summary>
    /// Creates a VerificationErrorEvent using a node UID.
    /// </summary>
    public static VerificationErrorEvent CreateVerificationErrorEvent(
        NodeUid nodeUid,
        EncryptedField field,
        DateTime creationTime,
        bool thirdParty,
        bool sdk,
        string? error)
    {
        return new VerificationErrorEvent
        {
            Uid = nodeUid,
            Field = field,
            Recency = GetRecency(creationTime, DateTime.UtcNow),
            CreatedBy = GetCreator(thirdParty, sdk),
            Error = error,
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
        catch (Exception ex)
        {
            client.Telemetry.GetLogger("TelemetryEventFactory")
                .LogDebug(ex, "Failed to resolve volume type for node {NodeUid}", nodeUid);
            return VolumeType.Unknown;
        }
    }

    internal static ItemRecency GetRecency(DateTime creationTime, DateTime now)
    {
        if (creationTime >= now.AddMonths(-1))
        {
            return ItemRecency.PastMonth;
        }

        if (creationTime >= now.AddYears(-1))
        {
            return ItemRecency.PastYear;
        }

        return creationTime >= Since2024Boundary ? ItemRecency.Since2024 : ItemRecency.Before2024;
    }

    internal static ItemCreator GetCreator(bool thirdParty, bool sdk)
    {
        if (!thirdParty)
        {
            return ItemCreator.FirstParty;
        }

        return sdk ? ItemCreator.ThirdPartyWithSdk : ItemCreator.ThirdPartyWithoutSdk;
    }

    private static (DateTime CreationTime, bool ThirdParty, bool Sdk) GetItemContext(
        EncryptedField field,
        LinkDto link,
        ActiveRevisionDto? activeRevision)
    {
        return field == EncryptedField.NodeExtendedAttributes && activeRevision is not null
            ? (activeRevision.CreationTime, activeRevision.ThirdParty, activeRevision.Sdk)
            : (link.CreationTime, link.ThirdParty, link.Sdk);
    }
}
