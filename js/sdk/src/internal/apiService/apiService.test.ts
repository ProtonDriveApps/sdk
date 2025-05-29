import { ProtonDriveHTTPClient, SDKEvent } from "../../interface";
import { getMockTelemetry } from "../../tests/telemetry";
import { SDKEvents } from "../sdkEvents";
import { DriveAPIService } from './apiService';
import { HTTPErrorCode, ErrorCode } from './errorCodes';

jest.useFakeTimers();

function generateOkResponse() {
    return new Response(JSON.stringify({ Code: ErrorCode.OK }), { status: HTTPErrorCode.OK });
}

describe("DriveAPIService", () => {
    let sdkEvents: SDKEvents;
    let httpClient: ProtonDriveHTTPClient;
    let api: DriveAPIService;

    beforeEach(() => {
        void jest.runAllTimersAsync();

        // @ts-expect-error: No need to implement all methods for mocking
        sdkEvents = {
            transfersPaused: jest.fn(),
            transfersResumed: jest.fn(),
            requestsThrottled: jest.fn(),
            requestsUnthrottled: jest.fn(),
        }
        httpClient = {
            fetchJson: jest.fn(() => Promise.resolve(generateOkResponse())),
            fetchBlob: jest.fn(() => Promise.resolve(new Response(new Uint8Array([1, 2, 3])))),
        };
        api = new DriveAPIService(getMockTelemetry(), sdkEvents, httpClient, 'http://drive.proton.me', 'en');
    });

    function expectSDKEvents(...events: SDKEvent[]) {
        expect(sdkEvents.transfersPaused).toHaveBeenCalledTimes(events.includes(SDKEvent.TransfersPaused) ? 1 : 0);
        expect(sdkEvents.transfersResumed).toHaveBeenCalledTimes(events.includes(SDKEvent.TransfersResumed) ? 1 : 0);
        expect(sdkEvents.requestsThrottled).toHaveBeenCalledTimes(events.includes(SDKEvent.RequestsThrottled) ? 1 : 0);
        expect(sdkEvents.requestsUnthrottled).toHaveBeenCalledTimes(events.includes(SDKEvent.RequestsUnthrottled) ? 1 : 0);
    }

    describe("should make", () => {
        it("GET request", async () => {
            const result = await api.get('test');
            expect(result).toEqual({ Code: ErrorCode.OK });
            await expectFetchJsonToBeCalledWith('GET');
        });

        it("POST request", async () => {
            const result = await api.post('test', { data: 'test' });
            expect(result).toEqual({ Code: ErrorCode.OK });
            await expectFetchJsonToBeCalledWith('POST', { data: 'test' });
        });

        it("PUT request", async () => {
            const result = await api.put('test', { data: 'test' });
            expect(result).toEqual({ Code: ErrorCode.OK });
            await expectFetchJsonToBeCalledWith('PUT', { data: 'test' });
        });

        async function expectFetchJsonToBeCalledWith(method: string, data?: object) {
            // @ts-expect-error: Fetch is mock.
            const request = httpClient.fetchJson.mock.calls[0][0];
            expect(request.method).toEqual(method);
            expect(request.timeoutMs).toEqual(30000);
            expect(Array.from(request.headers.entries())).toEqual(Array.from(new Headers({
                "Accept": "application/vnd.protonmail.v1+json",
                "Content-Type": "application/json",
                "Language": 'en',
                "x-pm-drive-sdk-version": `js@${process.env.npm_package_version}`,
            }).entries()));
            expect(await request.json).toEqual(data);
            expectSDKEvents();
        }

        it("storage GET request", async () => {
            const stream = await api.getBlockStream('test', 'token');
            const result = await Array.fromAsync(stream);
            expect(result).toEqual([new Uint8Array([1, 2, 3])]);
            await expectFetchBlobToBeCalledWith('GET');
        });

        it("storage POST request", async () => {
            const data = new Blob();
            await api.postBlockStream('test', 'token', data);
            await expectFetchBlobToBeCalledWith('POST', data);
        });

        async function expectFetchBlobToBeCalledWith(method: string, data?: object) {
            // @ts-expect-error: Fetch is mock.
            const request = httpClient.fetchBlob.mock.calls[0][0];
            expect(request.method).toEqual(method);
            expect(request.timeoutMs).toEqual(90000);
            expect(Array.from(request.headers.entries())).toEqual(Array.from(new Headers({
                "pm-storage-token": 'token',
                "Language": 'en',
                "x-pm-drive-sdk-version": `js@${process.env.npm_package_version}`,
            }).entries()));
            expect(request.body).toEqual(data);
            expectSDKEvents();
        }
    });

    describe("should throw", () => {
        it("APIHTTPError on 4xx response without JSON body", async () => {
            httpClient.fetchJson = jest.fn(() => Promise.resolve(new Response('Not found', { status: 404, statusText: 'Not found' })));
            await expect(api.get('test')).rejects.toThrow(new Error('Not found'));
            expectSDKEvents();
        });

        it("APIError on 4xx response with JSON body", async () => {
            httpClient.fetchJson = jest.fn(() => Promise.resolve(new Response(JSON.stringify({ Code: 42, Error: 'General error' }), { status: 422 })));
            await expect(api.get('test')).rejects.toThrow('General error');
            expectSDKEvents();
        });
    });

    describe("should retry", () => {
        it("on offline error", async () => {
            const error = new Error('Network offline');
            error.name = 'OfflineError';
            httpClient.fetchJson = jest.fn()
                .mockRejectedValueOnce(error)
                .mockRejectedValueOnce(error)
                .mockResolvedValueOnce(generateOkResponse());

            const result = api.get('test');

            await expect(result).resolves.toEqual({ Code: ErrorCode.OK });
            expect(httpClient.fetchJson).toHaveBeenCalledTimes(3);
            expectSDKEvents();
        });

        it("on timeout error", async () => {
            const error = new Error('Timeouted');
            error.name = 'TimeoutError';
            httpClient.fetchJson = jest.fn()
                .mockRejectedValueOnce(error)
                .mockRejectedValueOnce(error)
                .mockResolvedValueOnce(generateOkResponse());

            const result = api.get('test');

            await expect(result).resolves.toEqual({ Code: ErrorCode.OK });
            expect(httpClient.fetchJson).toHaveBeenCalledTimes(3);
            expectSDKEvents();
        });

        it("on general error", async () => {
            httpClient.fetchJson = jest.fn()
                .mockRejectedValueOnce(new Error('Error'))
                .mockResolvedValueOnce(generateOkResponse());

            const result = api.get('test');

            await expect(result).resolves.toEqual({ Code: ErrorCode.OK });
            expect(httpClient.fetchJson).toHaveBeenCalledTimes(2);
            expectSDKEvents();
        });

        it("only once on general error", async () => {
            httpClient.fetchJson = jest.fn()
                .mockRejectedValueOnce(new Error('First error'))
                .mockRejectedValueOnce(new Error('Second error'))
                .mockResolvedValueOnce(generateOkResponse());

            const result = api.get('test');

            await expect(result).rejects.toThrow("Second error");
            expect(httpClient.fetchJson).toHaveBeenCalledTimes(2);
            expectSDKEvents();
        });

        it("on 429 response", async () => {
            httpClient.fetchJson = jest.fn()
                .mockResolvedValueOnce(new Response('', { status: HTTPErrorCode.TOO_MANY_REQUESTS, statusText: 'Some error' }))
                .mockResolvedValueOnce(new Response('', { status: HTTPErrorCode.TOO_MANY_REQUESTS, statusText: 'Some error' }))
                .mockResolvedValueOnce(generateOkResponse());

            const result = api.get('test');

            await expect(result).resolves.toEqual({ Code: ErrorCode.OK });
            expect(httpClient.fetchJson).toHaveBeenCalledTimes(3);
            // No event is sent on random 429, only if limit of too many subsequent 429s is reached.
            expectSDKEvents();
        });

        it("on 5xx response", async () => {
            httpClient.fetchJson = jest.fn()
                .mockResolvedValueOnce(new Response('', { status: HTTPErrorCode.INTERNAL_SERVER_ERROR, statusText: 'Some error' }))
                .mockResolvedValueOnce(generateOkResponse());

            const result = api.get('test');

            await expect(result).resolves.toEqual({ Code: ErrorCode.OK });
            expect(httpClient.fetchJson).toHaveBeenCalledTimes(2);
            expectSDKEvents();
        });

        it("only once on 5xx response", async () => {
            httpClient.fetchJson = jest.fn()
                .mockResolvedValue(new Response('', { status: HTTPErrorCode.INTERNAL_SERVER_ERROR, statusText: 'Some error' }));

            const result = api.get('test');

            await expect(result).rejects.toThrow("Some error");
            expect(httpClient.fetchJson).toHaveBeenCalledTimes(2);
            expectSDKEvents();
        });
    });

    describe("should handle subsequent errors", () => {
        it("limit 429 errors", async () => {
            httpClient.fetchJson = jest.fn()
                .mockResolvedValue(new Response('', { status: HTTPErrorCode.TOO_MANY_REQUESTS, statusText: 'Some error' }));

            for (let i = 0; i < 20; i++) {
                await api.get('test').catch(() => {});
            }

            await expect(api.get('test')).rejects.toThrow("Too many server requests, please try again later");
            expect(httpClient.fetchJson).toHaveBeenCalledTimes(50);
            expectSDKEvents(SDKEvent.RequestsThrottled);

            // SDK will not send any requests for 60 seconds.
            jest.advanceTimersByTime(90 * 1000);
            httpClient.fetchJson = jest.fn().mockResolvedValue(generateOkResponse());
            await api.get('test');
            expect(sdkEvents.requestsThrottled).toHaveBeenCalledTimes(1);
        });

        it("do not limit 429s when some pass", async () => {
            let attempt = 0;
            httpClient.fetchJson = jest.fn()
                .mockImplementation(() => {
                    if (attempt++ % 5 === 0) {
                        return generateOkResponse();
                    }
                    return new Response('', { status: HTTPErrorCode.TOO_MANY_REQUESTS, statusText: 'Some error' });
                });

            for (let i = 0; i < 20; i++) {
                await api.get('test').catch(() => {});
            }

            await expect(api.get('test')).resolves.toEqual({ Code: ErrorCode.OK });
            // 20 calls * 5 retries till OK response + 1 last successful call
            expect(httpClient.fetchJson).toHaveBeenCalledTimes(101);
            expectSDKEvents();
        });

        it("limit server errors", async () => {
            httpClient.fetchJson = jest.fn()
                .mockResolvedValue(new Response('', { status: HTTPErrorCode.INTERNAL_SERVER_ERROR, statusText: 'Some error' }));

            for (let i = 0; i < 20; i++) {
                await api.get('test').catch(() => {});
            }

            await expect(api.get('test')).rejects.toThrow("Too many server errors, please try again later");
            expect(httpClient.fetchJson).toHaveBeenCalledTimes(10);
            expectSDKEvents();
        });

        it("do not limit server errors when some pass", async () => {
            let attempt = 0;
            httpClient.fetchJson = jest.fn()
                .mockImplementation(() => {
                    if (attempt++ % 5 === 0) {
                        return generateOkResponse();
                    }
                    return new Response('', { status: HTTPErrorCode.INTERNAL_SERVER_ERROR, statusText: 'Some error' });
                });
        
            for (let i = 0; i < 20; i++) {
                await api.get('test').catch(() => {});
            }

            await expect(api.get('test')).rejects.toThrow("Some error");
            // 15 erroring calls * 2 attempts + 5 successful calls
            expect(httpClient.fetchJson).toHaveBeenCalledTimes(35);
            expectSDKEvents();
        });
    });
});
