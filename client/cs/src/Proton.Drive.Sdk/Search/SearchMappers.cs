using Proton.Drive.Sdk.Search.Abstractions;

namespace Proton.Drive.Sdk.Search;

/// <summary>
/// Converts between the keys the Rust search engine gives its stored blobs and the SDK's <see cref="SearchIndexKey"/>.
/// </summary>
/// <remarks>
/// <para>
/// The engine names each blob it stores through <see cref="SearchIndexStoreBridge"/> with a <see cref="StorageKey"/>
/// of the form <c>&lt;tag&gt;-&lt;name&gt;</c>. The tag is <c>internal</c> for the engine's own bookkeeping,
/// such as its version header, or <c>index-metadata</c> for a metadata index.
/// </para>
/// <para>
/// <see cref="ToSearchIndexKey(StorageKey)"/> splits that key into a category and a logical key, and rejects any other format.
/// <see cref="ToKeyString"/> rebuilds the same string. <see cref="BinaryKeyValueSearchIndexStore"/> uses it, after its own prefix,
/// as the key in the application's key-value store.
/// </para>
/// </remarks>
internal static class SearchMappers
{
    private const string InternalPrefix = "internal-";
    private const string MetadataIndexPrefix = "index-metadata-";

    internal static SearchIndexKey ToSearchIndexKey(StorageKey key) => ToSearchIndexKey(key.Inner);

    internal static SearchIndexKey ToSearchIndexKey(string inner)
    {
        if (inner.StartsWith(InternalPrefix, StringComparison.Ordinal))
        {
            return new SearchIndexKey(SearchIndexCategory.Internal, inner[InternalPrefix.Length..]);
        }

        if (inner.StartsWith(MetadataIndexPrefix, StringComparison.Ordinal))
        {
            return new SearchIndexKey(SearchIndexCategory.MetadataIndex, inner[MetadataIndexPrefix.Length..]);
        }

        throw new FormatException($"Invalid search index key format: \"{inner}\".");
    }

    internal static StorageKey ToStorageKey(SearchIndexKey key) => new(ToKeyString(key));

    internal static string ToKeyString(SearchIndexKey key)
        => $"{key.Category.ToWireTag()}-{key.LogicalKey}";
}
