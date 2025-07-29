import { ProtonDriveHTTPClient, ProtonDriveHTTPClientBlobOptions, ProtonDriveHTTPClientJsonOptions } from "../interface";
import { EventsGenerator } from './eventsGenerator';

/**
 * Special HTTP client that is compatible with the SDK.
 *
 * It is a probe into SDK to observe whats going on and report any suspicious
 * behavior.
 *
 * It should be used only for diagnostic purposes.
 */
export class DiagnosticHTTPClient extends EventsGenerator implements ProtonDriveHTTPClient {
    constructor(private httpClient: ProtonDriveHTTPClient) {
        super();
        this.httpClient = httpClient;
    }

    async fetchJson(options: ProtonDriveHTTPClientJsonOptions): Promise<Response> {
        try {
            const response = await this.httpClient.fetchJson(options);

            if (response.status >= 400 && response.status !== 429) {
                try {
                    const json = await response.json();

                    this.enqueueEvent({
                        type: 'http_error',
                        request: {
                            url: options.url,
                            method: options.method,
                            json: options.json,
                        },
                        response: {
                            status: response.status,
                            statusText: response.statusText,
                            json,
                        },
                    });

                    return new Response(JSON.stringify(json), {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers,
                    });
                } catch (jsonError: unknown) {
                    this.enqueueEvent({
                        type: 'http_error',
                        request: {
                            url: options.url,
                            method: options.method,
                            json: options.json,
                        },
                        response: {
                            status: response.status,
                            statusText: response.statusText,
                            jsonError,
                        },
                    });
                }
            }

            return response;
        } catch (error: unknown) {
            this.enqueueEvent({
                type: 'http_error',
                request: {
                    url: options.url,
                    method: options.method,
                    json: options.json,
                },
                error,
            });
            throw error;
        }
    }

    fetchBlob(options: ProtonDriveHTTPClientBlobOptions): Promise<Response> {
        return this.httpClient.fetchBlob(options);
    }
}