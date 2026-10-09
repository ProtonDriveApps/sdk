import { MemoryCache } from './cache';
import { ProtonDriveClient } from './protonDriveClient';
import { SearchSdkCapabilitiesAdapter } from './search/sdkCapabilities';
import type { ProtonDriveSearchClient, SearchServiceProvider } from './search/types';
import { getMockTelemetry } from './tests/telemetry';
import { VERSION } from './version';

describe('ProtonDriveClient', () => {
    describe('experimental.initSearch', () => {
        let searchClient: ProtonDriveSearchClient;
        let searchServiceProvider: SearchServiceProvider;
        let client: ProtonDriveClient;
        let getMyFilesShareMemberEmailKey: jest.SpyInstance;

        beforeEach(() => {
            // @ts-expect-error No need to implement all methods for mocking
            searchClient = {};
            searchServiceProvider = {
                start: jest.fn().mockResolvedValue(searchClient),
            };
            client = new ProtonDriveClient({
                // @ts-expect-error No need to implement all methods for mocking
                httpClient: {},
                entitiesCache: new MemoryCache(),
                cryptoCache: new MemoryCache(),
                // @ts-expect-error No need to implement all methods for mocking
                account: {},
                // @ts-expect-error No need to implement all methods for mocking
                openPGPCryptoModule: {},
                // @ts-expect-error No need to implement all methods for mocking
                srpModule: {},
                telemetry: getMockTelemetry(),
                searchServiceProvider,
            });
            getMyFilesShareMemberEmailKey = jest
                .spyOn(client['shares'], 'getMyFilesShareMemberEmailKey')
                // @ts-expect-error No need to implement all fields for mocking
                .mockResolvedValue({ addressId: 'addressId' });
        });

        it('starts the search service for the address of My files', async () => {
            const result = await client.experimental.initSearch();

            expect(result).toBe(searchClient);
            expect(searchServiceProvider.start).toHaveBeenCalledWith(
                VERSION,
                'addressId',
                expect.any(SearchSdkCapabilitiesAdapter),
            );
        });

        it('returns the same search client on later calls', async () => {
            const first = await client.experimental.initSearch();
            const second = await client.experimental.initSearch();

            expect(second).toBe(first);
            expect(searchServiceProvider.start).toHaveBeenCalledTimes(1);
            expect(getMyFilesShareMemberEmailKey).toHaveBeenCalledTimes(1);
        });

        it('starts the search service once for concurrent calls', async () => {
            const [first, second] = await Promise.all([
                client.experimental.initSearch(),
                client.experimental.initSearch(),
            ]);

            expect(second).toBe(first);
            expect(searchServiceProvider.start).toHaveBeenCalledTimes(1);
        });

        it('starts again after a failed start', async () => {
            jest.mocked(searchServiceProvider.start).mockRejectedValueOnce(new Error('start failed'));

            await expect(client.experimental.initSearch()).rejects.toThrow('start failed');
            const result = await client.experimental.initSearch();

            expect(result).toBe(searchClient);
            expect(searchServiceProvider.start).toHaveBeenCalledTimes(2);
        });

        it('looks up the address again after a failed lookup', async () => {
            getMyFilesShareMemberEmailKey.mockRejectedValueOnce(new Error('lookup failed'));

            await expect(client.experimental.initSearch()).rejects.toThrow('lookup failed');
            const result = await client.experimental.initSearch();

            expect(result).toBe(searchClient);
            expect(getMyFilesShareMemberEmailKey).toHaveBeenCalledTimes(2);
            expect(searchServiceProvider.start).toHaveBeenCalledTimes(1);
        });
    });
});
