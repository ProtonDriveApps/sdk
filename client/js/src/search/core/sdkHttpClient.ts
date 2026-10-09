import { wireErr } from '@boltffi/runtime';

import type { SearchApiMethod, SearchSdkCapabilities } from '../sdkCapabilities';
import type { HttpClient } from '../vendor/proton_drive_sdk_search.js';

/**
 * Reaches the Drive API through the SDK client, which holds the session: the
 * drive engines send and receive JSON bytes, the SDK takes and returns JSON.
 *
 * The SDK has already checked the response `Code`, so a failure reaches the
 * engines as `RequestFailed`.
 */
export class SdkHttpClient implements HttpClient {
    constructor(private getCapabilities: () => SearchSdkCapabilities) {
        this.getCapabilities = getCapabilities;
    }

    async get(path: string) {
        return this.request('GET', path);
    }

    async post(path: string, body: Uint8Array) {
        return this.request('POST', path, body);
    }

    async put(path: string, body: Uint8Array) {
        return this.request('PUT', path, body);
    }

    private async request(method: SearchApiMethod, path: string, body?: Uint8Array) {
        try {
            const json = body?.length ? JSON.parse(new TextDecoder().decode(body)) : undefined;
            const response = await this.getCapabilities().apiRequest(method, path, json);
            return new TextEncoder().encode(JSON.stringify(response));
        } catch (error: unknown) {
            return wireErr({
                tag: 'RequestFailed',
                value0: error instanceof Error ? error.message : String(error),
            } as const);
        }
    }
}
