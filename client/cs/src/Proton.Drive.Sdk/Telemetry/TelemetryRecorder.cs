using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Nodes;

namespace Proton.Drive.Sdk.Telemetry;

internal static class TelemetryRecorder
{
    /// <summary>
    /// Attempts to record decryption error events for a degraded node with multiple failed fields.
    /// </summary>
    public static void TryRecordDecryptionError(
        ProtonDriveClient client,
        NodeUid nodeUid,
        LinkDto link,
        ActiveRevisionDto? activeRevision,
        IReadOnlyDictionary<EncryptedField, ProtonDriveError> failedFields)
    {
        try
        {
            foreach (var @event in TelemetryEventFactory.CreateDecryptionErrorEvents(
                         nodeUid,
                         link,
                         activeRevision,
                         failedFields))
            {
                client.Telemetry.RecordMetric(@event);
            }
        }
        catch
        {
            // Do nothing - telemetry failures should not break the main flow
        }
    }

    /// <summary>
    /// Attempts to record a verification error event using a node UID.
    /// </summary>
    public static void TryRecordVerificationError(
        ProtonDriveClient client,
        NodeUid nodeUid,
        EncryptedField field,
        DateTime creationTime,
        bool thirdParty,
        bool sdk,
        string? error)
    {
        try
        {
            var @event = TelemetryEventFactory.CreateVerificationErrorEvent(nodeUid, field, creationTime, thirdParty, sdk, error);

            client.Telemetry.RecordMetric(@event);
        }
        catch
        {
            // Do nothing - telemetry failures should not break the main flow
        }
    }
}
