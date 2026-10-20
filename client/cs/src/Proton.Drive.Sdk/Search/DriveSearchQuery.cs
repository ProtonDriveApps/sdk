namespace Proton.Drive.Sdk.Search;

/// <summary>
/// Query parameters for <see cref="ProtonDriveClient.QueryAsync"/>.
/// </summary>
public abstract record DriveSearchQuery
{
    public sealed record Text(string Value) : DriveSearchQuery;

    public sealed record Structured(DriveStructuredSearchQuery Filters) : DriveSearchQuery;
}
