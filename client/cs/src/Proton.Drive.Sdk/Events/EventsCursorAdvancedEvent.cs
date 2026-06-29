namespace Proton.Drive.Sdk.Events;

/// <summary>
/// Represents an event indicating that the cursor advanced without substantive data changes.
/// The cursor was moved forward to avoid loss of continuity. Consumers should use this ID as the cursor for the next request to enumerate events.
/// </summary>
/// <param name="id">The unique event ID.</param>
public sealed class EventsCursorAdvancedEvent(DriveEventId id) : DriveEvent(id);
