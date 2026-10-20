namespace Proton.Drive.Sdk.Search;

/// <summary>
/// Recommended delay before scheduling the same background search operation again.
/// </summary>
public sealed record DriveSearchWorkSchedule(TimeSpan RecommendedNextCallAfter);
