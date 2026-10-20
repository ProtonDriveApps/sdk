namespace Proton.Drive.Sdk.Search;

/// <summary>
/// Inclusive size bounds for structured search filters.
/// </summary>
public sealed record DriveSearchSizeRange(ulong? From, ulong? To);
