using Proton.Drive.Sdk.Nodes;

namespace Proton.Drive.Sdk.Telemetry;

internal static class TelemetryRecorder
{
    /// <summary>
    /// Attempts to record decryption error events for a degraded node with multiple failed fields.
    /// </summary>
    public static async Task TryRecordDecryptionErrorAsync(
        ProtonDriveClient client,
        DegradedNodeMetadata degradedNode,
        IEnumerable<EncryptedField> failedFields,
        CancellationToken cancellationToken)
    {
        try
        {
            var events = await TelemetryEventFactory.CreateDecryptionErrorEventsAsync(
                client,
                degradedNode,
                failedFields,
                cancellationToken).ConfigureAwait(false);

            foreach (var @event in events)
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
    /// Attempts to record a decryption error event for a single field using a node UID.
    /// </summary>
    public static async Task TryRecordDecryptionErrorAsync(
        ProtonDriveClient client,
        NodeUid nodeUid,
        EncryptedField field,
        DateTime creationTime,
        CancellationToken cancellationToken)
    {
        try
        {
            var @event = await TelemetryEventFactory.CreateDecryptionErrorEventAsync(
                client,
                nodeUid,
                field,
                creationTime,
                cancellationToken).ConfigureAwait(false);

            client.Telemetry.RecordMetric(@event);
        }
        catch
        {
            // Do nothing - telemetry failures should not break the main flow
        }
    }

    /// <summary>
    /// Attempts to record a verification error event using a node UID.
    /// </summary>
    public static async Task TryRecordVerificationErrorAsync(
        ProtonDriveClient client,
        NodeUid nodeUid,
        EncryptedField field,
        DateTime creationTime,
        CancellationToken cancellationToken)
    {
        try
        {
            var @event = await TelemetryEventFactory.CreateVerificationErrorEventAsync(
                client,
                nodeUid,
                field,
                creationTime,
                cancellationToken).ConfigureAwait(false);

            client.Telemetry.RecordMetric(@event);
        }
        catch
        {
            // Do nothing - telemetry failures should not break the main flow
        }
    }
}
