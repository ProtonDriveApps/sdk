import { wireErr } from '@boltffi/runtime';

import type { SearchSdkCapabilities } from '../sdkCapabilities';
import { SdkHttpClient } from './sdkHttpClient';

const encode = (json: object) => new TextEncoder().encode(JSON.stringify(json));

function setup() {
    const sdk: SearchSdkCapabilities = {
        loadNodes: jest.fn(),
        apiRequest: jest.fn(async () => ({ Code: 1000 })),
    };
    return { sdk, client: new SdkHttpClient(() => sdk) };
}

describe('SdkHttpClient', () => {
    it('sends the JSON body through the SDK and returns the JSON response as bytes', async () => {
        const { sdk, client } = setup();

        const response = await client.post('drive/search/extraction-queue', encode({ Limit: 1 }));

        expect(sdk.apiRequest).toHaveBeenCalledWith('POST', 'drive/search/extraction-queue', { Limit: 1 });
        expect(response).toEqual(encode({ Code: 1000 }));
    });

    it('sends no body for a GET', async () => {
        const { sdk, client } = setup();

        await client.get('drive/search/extracted-data?Context=LastAccessedNodes');

        expect(sdk.apiRequest).toHaveBeenCalledWith(
            'GET',
            'drive/search/extracted-data?Context=LastAccessedNodes',
            undefined,
        );
    });

    it('reports a failed request as RequestFailed', async () => {
        const { sdk, client } = setup();
        jest.mocked(sdk.apiRequest).mockRejectedValue(new Error('Offline'));

        expect(await client.post('drive/search/extracted-data', encode({}))).toEqual(
            wireErr({ tag: 'RequestFailed', value0: 'Offline' }),
        );
    });
});
