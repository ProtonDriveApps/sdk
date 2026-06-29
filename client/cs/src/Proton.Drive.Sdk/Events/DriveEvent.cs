namespace Proton.Drive.Sdk.Events;

/// <summary>
/// Base type for a remote data update event in an event scope.
/// </summary>
/// <param name="id">The unique event ID.</param>
public abstract class DriveEvent(DriveEventId id)
{
    /// <summary>
    /// The unique event ID. Consumers should persist it as the next cursor after applying the event.
    /// </summary>
    public DriveEventId Id { get; } = id;
}
