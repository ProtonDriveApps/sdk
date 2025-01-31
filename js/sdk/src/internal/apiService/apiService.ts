import { ProtonDriveHTTPClient, Logger } from "../../interface/index.js";
import { ErrorCode } from './errorCodes';
import { apiErrorFactory, APIError } from './errors';

export interface DriveAPIService {
    get: <Response>(url: string, signal?: AbortSignal) => Promise<Response>,
    post: <Request, Response>(url: string, data: Request, signal?: AbortSignal) => Promise<Response>,
    put: <Request, Response>(url: string, data: Request, signal?: AbortSignal) => Promise<Response>,
};

/**
 * Provides API communication used withing the Drive SDK.
 * 
 * The service is responsible for handling general headers, errors, conversion
 * or rate limiting.
 */
export function getApiService(httpClient: ProtonDriveHTTPClient, baseUrl: string, language: string, logger?: Logger): DriveAPIService {
    async function get<Response>(url: string, signal?: AbortSignal): Promise<Response> {
        return makeRequest(url, 'GET', undefined, signal);
    };

    async function post<Request, Response>(url: string, data: Request, signal?: AbortSignal): Promise<Response> {
        return makeRequest(url, 'POST', data, signal);
    };

    async function put<Request, Response>(url: string, data: Request, signal?: AbortSignal): Promise<Response> {
        return makeRequest(url, 'PUT', data, signal);
    };

    // TODO: rate limit implementation
    async function makeRequest<Response, Request>(url: string, method = 'GET', data?: Request, signal?: AbortSignal) {
        logger?.debug(`${method} ${url}`);

        const response = await httpClient.fetch(new Request(`${baseUrl}/${url}`, {
            method: method || 'GET',
            // TODO: set SDK-specific headers (accept: json, language, SDK version)
            headers: new Headers({
                "Language": language,
            }),
        }), signal);

        if (response.ok) {
            logger?.info(`${method} ${url}: ${response.status}`);
        } else {
            logger?.warn(`${method} ${url}: ${response.status}`);
        }

        try {
            const result = await response.json();
            if (!response.ok || result.Code !== ErrorCode.OK) {
                throw apiErrorFactory({ response, result });
            }
            return result as Response;
        } catch (error: unknown) {
            if (error instanceof APIError) {
                throw error;
            }
            throw apiErrorFactory({ response });
        }
    }

    return {
        get,
        put,
        post,
    };
}
