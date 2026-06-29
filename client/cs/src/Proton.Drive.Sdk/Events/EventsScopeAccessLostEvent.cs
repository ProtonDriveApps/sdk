namespace Proton.Drive.Sdk.Events;

/// <summary>
/// Represents an event indicating that access to the event scope was lost. This implies loss of access to all trees under that scope.
/// Consumers should stop enumerating events for that scope, stop requesting files or folders in trees of that scope, and usually remove all local data for it.
/// </summary>
/// <param name="id">The unique event ID.</param>
public sealed class EventsScopeAccessLostEvent(DriveEventId id) : DriveEvent(id);
