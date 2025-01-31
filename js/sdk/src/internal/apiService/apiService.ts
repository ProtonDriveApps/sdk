import { ProtonDriveHTTPClient, Logger } from "../../interface/index.js";
import { ErrorCode } from './errorCodes';
import { apiErrorFactory, APIError } from './errors';

/**
 * Provides API communication used withing the Drive SDK.
 * 
 * The service is responsible for handling general headers, errors, conversion
 * or rate limiting.
 */
export class DriveAPIService {
    constructor(private httpClient: ProtonDriveHTTPClient, private baseUrl: string, private language: string, private logger?: Logger) {
        this.httpClient = httpClient;
        this.baseUrl = baseUrl;
        this.language = language;
        this.logger = logger;
    }

    async get<Response>(url: string, signal?: AbortSignal): Promise<Response> {
        return this.makeRequest(url, 'GET', undefined, signal);
    };

    async post<Request, Response>(url: string, data: Request, signal?: AbortSignal): Promise<Response> {
        return this.makeRequest(url, 'POST', data, signal);
    };

    async put<Request, Response>(url: string, data: Request, signal?: AbortSignal): Promise<Response> {
        return this.makeRequest(url, 'PUT', data, signal);
    };

    // TODO: rate limit implementation
    private async  makeRequest<Response, Request>(url: string, method = 'GET', data?: Request, signal?: AbortSignal) {
        this.logger?.debug(`${method} ${url}`);

        const response = await this.httpClient.fetch(new Request(`${this.baseUrl}/${url}`, {
            method: method || 'GET',
            // TODO: set SDK-specific headers (accept: json, language, SDK version)
            headers: new Headers({
                "Language": this.language,
            }),
        }), signal);

        if (response.ok) {
            this.logger?.info(`${method} ${url}: ${response.status}`);
        } else {
            this.logger?.warn(`${method} ${url}: ${response.status}`);
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
}
