using Proton.Sdk.Storage;
using SearchHttpClient = Proton.Drive.Sdk.Search.HttpClient;

namespace Proton.Drive.Sdk.Search;

internal static class SearchEngineFactory
{
    public static (DriveSearchEngine SearchEngine, DriveExtractEngine ExtractEngine, SearchHttpClient Http) CreateEngines(
        ProtonDriveClient client,
        IBinaryKeyValueStore keyValueStore)
    {
        var searchHttpClient = CreateSearchHttpClient(client);
        var indexStore = new BinaryKeyValueSearchIndexStore(keyValueStore, DriveSearchDefaults.IndexStoreKeyPrefix);
        var searchStorage = new SearchIndexStoreBridge(indexStore);
        var driveSdk = new ProtonDriveClientAdapter(client);

        var searchEngine = new DriveSearchEngine(
            searchStorage,
            searchHttpClient,
            DriveSearchDefaults.CsprngSeed,
            time: null,
            client.Uid);

        var extractEngine = new DriveExtractEngine(
            driveSdk,
            searchHttpClient,
            time: null,
            client.Uid);

        return (searchEngine, extractEngine, searchHttpClient);
    }

    private static SearchHttpClient CreateSearchHttpClient(ProtonDriveClient client)
    {
        if (client.DefaultApiHttpClient is not { } httpClient)
        {
            throw new InvalidOperationException("Search requires the client to be created with a default API HTTP client.");
        }

        return new ProtonDriveSearchHttpClient(httpClient);
    }
}
