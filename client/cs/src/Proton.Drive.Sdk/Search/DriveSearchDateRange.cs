namespace Proton.Drive.Sdk.Search;

/// <summary>
/// Inclusive date bounds for structured search filters.
/// </summary>
public sealed record DriveSearchDateRange(DateTimeOffset? From, DateTimeOffset? To);
