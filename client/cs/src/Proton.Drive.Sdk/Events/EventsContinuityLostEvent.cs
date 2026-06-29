namespace Proton.Drive.Sdk.Events;

/// <summary>
/// Represents an event indicating that event continuity was lost. Consumers should mark their current state as stale and resync from the current server state.
/// </summary>
/// <param name="id">The unique event ID.</param>
public sealed class EventsContinuityLostEvent(DriveEventId id) : DriveEvent(id);
