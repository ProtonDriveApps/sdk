namespace Proton.Drive.Sdk.Events;

/// <summary>
/// Represents an event indicating that items shared with the current user changed (such as a new share, an unshare, or a permission change).
/// Consumers should refresh the list of items shared with them and any pending invitations.
/// </summary>
/// <param name="id">The unique event ID.</param>
public sealed class SharedWithMeUpdatedEvent(DriveEventId id) : DriveEvent(id);
