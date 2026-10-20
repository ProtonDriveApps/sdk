namespace Proton.Drive.Sdk.Search.Abstractions;

internal static class SearchIndexCategoryExtensions
{
    internal static string ToWireTag(this SearchIndexCategory category)
        => category switch
        {
            SearchIndexCategory.Internal => "internal",
            SearchIndexCategory.MetadataIndex => "index-metadata",
            _ => throw new ArgumentOutOfRangeException(nameof(category), category, null),
        };
}
