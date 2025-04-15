import { ProtonDriveHTTPClient } from "../../interface";
import { getMockTelemetry } from "../../tests/telemetry";
import { DriveAPIService } from './apiService';
import { HTTPErrorCode, ErrorCode } from './errorCodes';

jest.useFakeTimers();

function generateOkResponse() {
    return new Response(JSON.stringify({ Code: ErrorCode.OK }), { status: HTTPErrorCode.OK });
}

describe("DriveAPIService", () => {
    let httpClient: ProtonDriveHTTPClient;
    let api: DriveAPIService;

    beforeEach(() => {
        void jest.runAllTimersAsync();

        httpClient = {
            fetch: jest.fn(() => Promise.resolve(generateOkResponse())),
        };
        api = new DriveAPIService(getMockTelemetry(), httpClient, 'http://drive.proton.me', 'en');
    });

    describe("should make", () => {
        it("GET request", async () => {
            const result = await api.get('test');
            expect(result).toEqual({ Code: ErrorCode.OK });
            await expectToBeCalledWith('GET');
        });

        it("POST request", async () => {
            const result = await api.post('test', { data: 'test' });
            expect(result).toEqual({ Code: ErrorCode.OK });
            await expectToBeCalledWith('POST', { data: 'test' });
        });

        it("PUT request", async () => {
            const result = await api.put('test', { data: 'test' });
            expect(result).toEqual({ Code: ErrorCode.OK });
            await expectToBeCalledWith('PUT', { data: 'test' });
        });

        async function expectToBeCalledWith(method: string, data?: object) {
            // @ts-expect-error: Fetch is mock.
            const request = httpClient.fetch.mock.calls[0][0];
            expect(request.method).toEqual(method);
            expect(Array.from(request.headers.entries())).toEqual(Array.from(new Headers({
                "Accept": "application/vnd.protonmail.v1+json",
                "Content-Type": "application/json",
                "Language": 'en',
                "x-pm-drive-sdk-version": `js@${process.env.npm_package_version}`,
            }).entries()));
            expect(await request.text()).toEqual(data ? JSON.stringify(data) : "");
        }
    });

    describe("should throw", () => {
        it("APIHTTPError on 4xx response without JSON body", async () => {
            httpClient.fetch = jest.fn(() => Promise.resolve(new Response('Not found', { status: 404, statusText: 'Not found' })));
            await expect(api.get('test')).rejects.toThrow(new Error('Not found'));
        });

        it("APIError on 4xx response with JSON body", async () => {
            httpClient.fetch = jest.fn(() => Promise.resolve(new Response(JSON.stringify({ Code: 42, Error: 'General error' }), { status: 422 })));
            await expect(api.get('test')).rejects.toThrow('General error');
        });
    });

    describe("should retry", () => {
        it("on offline error", async () => {
            const error = new Error('Network offline');
            error.name = 'OfflineError';
            httpClient.fetch = jest.fn()
                .mockRejectedValueOnce(error)
                .mockRejectedValueOnce(error)
                .mockResolvedValueOnce(generateOkResponse());

            const result = api.get('test');

            await expect(result).resolves.toEqual({ Code: ErrorCode.OK });
            expect(httpClient.fetch).toHaveBeenCalledTimes(3);
        });

        it("on timeout error", async () => {
            const error = new Error('Timeouted');
            error.name = 'TimeoutError';
            httpClient.fetch = jest.fn()
                .mockRejectedValueOnce(error)
                .mockRejectedValueOnce(error)
                .mockResolvedValueOnce(generateOkResponse());

            const result = api.get('test');

            await expect(result).resolves.toEqual({ Code: ErrorCode.OK });
            expect(httpClient.fetch).toHaveBeenCalledTimes(3);
        });

        it("on general error", async () => {
            httpClient.fetch = jest.fn()
                .mockRejectedValueOnce(new Error('Error'))
                .mockResolvedValueOnce(generateOkResponse());

            const result = api.get('test');

            await expect(result).resolves.toEqual({ Code: ErrorCode.OK });
            expect(httpClient.fetch).toHaveBeenCalledTimes(2);
        });

        it("only once on general error", async () => {
            httpClient.fetch = jest.fn()
                .mockRejectedValueOnce(new Error('First error'))
                .mockRejectedValueOnce(new Error('Second error'))
                .mockResolvedValueOnce(generateOkResponse());

            const result = api.get('test');

            await expect(result).rejects.toThrow("Second error");
            expect(httpClient.fetch).toHaveBeenCalledTimes(2);
        });

        it("on 429 response", async () => {
            httpClient.fetch = jest.fn()
                .mockResolvedValueOnce(new Response('', { status: HTTPErrorCode.TOO_MANY_REQUESTS, statusText: 'Some error' }))
                .mockResolvedValueOnce(new Response('', { status: HTTPErrorCode.TOO_MANY_REQUESTS, statusText: 'Some error' }))
                .mockResolvedValueOnce(generateOkResponse());

            const result = api.get('test');

            await expect(result).resolves.toEqual({ Code: ErrorCode.OK });
            expect(httpClient.fetch).toHaveBeenCalledTimes(3);
        });

        it("on 5xx response", async () => {
            httpClient.fetch = jest.fn()
                .mockResolvedValueOnce(new Response('', { status: HTTPErrorCode.INTERNAL_SERVER_ERROR, statusText: 'Some error' }))
                .mockResolvedValueOnce(generateOkResponse());

            const result = api.get('test');

            await expect(result).resolves.toEqual({ Code: ErrorCode.OK });
            expect(httpClient.fetch).toHaveBeenCalledTimes(2);
        });

        it("only once on 5xx response", async () => {
            httpClient.fetch = jest.fn()
                .mockResolvedValue(new Response('', { status: HTTPErrorCode.INTERNAL_SERVER_ERROR, statusText: 'Some error' }));

            const result = api.get('test');

            await expect(result).rejects.toThrow("Some error");
            expect(httpClient.fetch).toHaveBeenCalledTimes(2);
        });
    });

    describe("should handle subsequent errors", () => {
        it("limit 429 errors", async () => {
            httpClient.fetch = jest.fn()
                .mockResolvedValue(new Response('', { status: HTTPErrorCode.TOO_MANY_REQUESTS, statusText: 'Some error' }));

            for (let i = 0; i < 20; i++) {
                await api.get('test').catch(() => {});
            }

            await expect(api.get('test')).rejects.toThrow("Too many server requests, please try again later");
            expect(httpClient.fetch).toHaveBeenCalledTimes(50);
        });

        it("do not limit 429s when some pass", async () => {
            let attempt = 0;
            httpClient.fetch = jest.fn()
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
            expect(httpClient.fetch).toHaveBeenCalledTimes(101);
        });

        it("limit server errors", async () => {
            httpClient.fetch = jest.fn()
                .mockResolvedValue(new Response('', { status: HTTPErrorCode.INTERNAL_SERVER_ERROR, statusText: 'Some error' }));

            for (let i = 0; i < 20; i++) {
                await api.get('test').catch(() => {});
            }

            await expect(api.get('test')).rejects.toThrow("Too many server errors, please try again later");
            expect(httpClient.fetch).toHaveBeenCalledTimes(10);
        });

        it("do not limit server errors when some pass", async () => {
            let attempt = 0;
            httpClient.fetch = jest.fn()
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
            expect(httpClient.fetch).toHaveBeenCalledTimes(35);
        });
    });
});
