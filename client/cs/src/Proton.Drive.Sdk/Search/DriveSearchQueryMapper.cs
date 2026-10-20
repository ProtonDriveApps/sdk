namespace Proton.Drive.Sdk.Search;

internal static class DriveSearchQueryMapper
{
    public static SearchIndex ToEngineIndex(DriveSearchLogicalIndex index)
    {
        return index switch
        {
            DriveSearchLogicalIndex.RecentNodes => SearchIndex.Recent,
            _ => throw new ArgumentOutOfRangeException(nameof(index)),
        };
    }

    public static SearchQuery ToEngineQuery(DriveSearchQuery query)
    {
        return query switch
        {
            DriveSearchQuery.Text text => new SearchQuery.Text(text.Value),
            DriveSearchQuery.Structured structured => new SearchQuery.Structured(ToEngineStructuredQuery(structured.Filters)),
            _ => throw new ArgumentOutOfRangeException(nameof(query)),
        };
    }

    private static StructuredSearchQuery ToEngineStructuredQuery(DriveStructuredSearchQuery query)
    {
        return new StructuredSearchQuery(
            query.Name,
            query.ParentUid is { } parent ? SearchNodeUidMapping.ToSearchNodeUid(parent) : null,
            query.MediaType,
            query.CreatedBy,
            query.OwnedBy,
            ToEngineDateRange(query.CreationTime),
            ToEngineDateRange(query.ModificationTime),
            ToEngineDateRange(query.LastAccessTime),
            ToEngineSizeRange(query.Size));
    }

    private static DateRange? ToEngineDateRange(DriveSearchDateRange? range)
    {
        if (range is null)
        {
            return null;
        }

        return new DateRange(ToUnixSeconds(range.From), ToUnixSeconds(range.To));
    }

    private static SizeRange? ToEngineSizeRange(DriveSearchSizeRange? range)
    {
        if (range is null)
        {
            return null;
        }

        return new SizeRange(range.From, range.To);
    }

    private static ulong? ToUnixSeconds(DateTimeOffset? value)
    {
        return value is { } instant ? (ulong)instant.ToUnixTimeSeconds() : null;
    }
}
