namespace Proton.Drive.Sdk.Search;

internal static class DriveSearchDefaults
{
    internal const nuint EngineBatchSize = 50;

    internal const string IndexStoreKeyPrefix = BinaryKeyValueSearchIndexStore.DefaultKeyPrefix;

    internal const string ExtractIndexStoreKeyPrefix = "search-extract";

    /// <summary>
    /// Desktop and mobile hosts use the OS entropy source; WASM hosts are not supported by this wrapper yet.
    /// </summary>
    internal static ulong? CsprngSeed => null;
}
