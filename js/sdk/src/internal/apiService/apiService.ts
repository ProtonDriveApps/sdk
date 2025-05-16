import { c } from 'ttag';

import { VERSION } from "../../version";
import { ProtonDriveHTTPClient, ProtonDriveTelemetry, Logger } from "../../interface";
import { AbortError, ServerError, RateLimitedError, ProtonDriveError } from '../../errors';
import { waitSeconds } from '../wait';
import { SDKEvents } from '../sdkEvents';
import { HTTPErrorCode, isCodeOk, isCodeOkAsync } from './errorCodes';
import { apiErrorFactory } from './errors';

/**
 * How many subsequent 429 errors are allowed before we stop further requests.
 */
const TOO_MANY_SUBSEQUENT_429_ERRORS = 50;

/**
 * For how long the API service should cool down after reaching the limit
 * of subsequent 429 errors.
 */
const TOO_MANY_SUBSEQUENT_429_ERRORS_TIMEOUT_IN_SECONDS = 60;

/**
 * How many subsequent 5xx errors are allowed before we stop further requests.
 */
const TOO_MANY_SUBSEQUENT_SERVER_ERRORS = 10;

/**
 * For how long the API service should cool down after reaching the limit
 * of subsequent 5xx errors.
 */
const TOO_MANY_SUBSEQUENT_SERVER_ERRORS_TIMEOUT_IN_SECONDS = 60;

/**
 * After how long to re-try after 5xx or timeout error.
 */
const SERVER_ERROR_RETRY_DELAY_SECONDS = 1;

/**
 * After how long to re-try after offline error.
 */
const OFFLINE_RETRY_DELAY_SECONDS = 5;

/**
 * After how long to re-try after 429 error without specified retry-after header.
 */
const DEFAULT_429_RETRY_DELAY_SECONDS = 10;

/**
 * After how long to re-try after general error.
 */
const GENERAL_RETRY_DELAY_SECONDS = 1;

/**
 * Provides API communication used withing the Drive SDK.
 *
 * The service is responsible for handling general headers, errors, conversion,
 * rate limiting, or basic re-tries.
 *
 * Error handling includes:
 *
 * * exception from HTTP client
 *   * retry on offline exc. (with delay from OFFLINE_RETRY_DELAY_SECONDS)
 *   * retry on timeout exc. (with delay from SERVER_ERROR_RETRY_DELAY_SECONDS)
 *   * retry ONCE on any exc. (with delay from GENERAL_RETRY_DELAY_SECONDS)
 * * HTTP status 429
 *   * retry (with delay from `retry-after` header or DEFAULT_429_RETRY_DELAY_SECONDS)
 *   * if too many subsequent 429s, stop further requests (defined in TOO_MANY_SUBSEQUENT_429_ERRORS)
 *   * when limit is reached, cool down for TOO_MANY_SUBSEQUENT_429_ERRORS_TIMEOUT_IN_SECONDS
 * * HTTP status 5xx
 *   * retry ONCE (with delay from SERVER_ERROR_RETRY_DELAY_SECONDS)
 *   * if too many subsequent 5xxs, stop further requests (defined in TOO_MANY_SUBSEQUENT_SERVER_ERRORS)
 *   * when limit is reached, cool down for TOO_MANY_SUBSEQUENT_SERVER_ERRORS_TIMEOUT_IN_SECONDS
 */
export class DriveAPIService {
    private subsequentTooManyRequestsCounter = 0;
    private lastTooManyRequestsErrorAt?: number;

    private subsequentServerErrorsCounter = 0;
    private lastServerErrorAt?: number;

    private logger: Logger;

    constructor(
        private telemetry: ProtonDriveTelemetry,
        private sdkEvents: SDKEvents,
        private httpClient: ProtonDriveHTTPClient,
        private baseUrl: string,
        private language: string,
    ) {
        this.logger = telemetry.getLogger('api');
        this.sdkEvents = sdkEvents;
        this.httpClient = httpClient;
        this.baseUrl = baseUrl;
        this.language = language;
        this.telemetry = telemetry;
    }

    async get<ResponsePayload>(url: string, signal?: AbortSignal): Promise<ResponsePayload> {
        return this.makeRequest(url, 'GET', undefined, signal);
    };

    async post<RequestPayload, ResponsePayload>(url: string, data?: RequestPayload, signal?: AbortSignal): Promise<ResponsePayload> {
        return this.makeRequest(url, 'POST', data, signal);
    };

    async put<RequestPayload, ResponsePayload>(url: string, data: RequestPayload, signal?: AbortSignal): Promise<ResponsePayload> {
        return this.makeRequest(url, 'PUT', data, signal);
    };

    async delete<Response>(url: string, signal?: AbortSignal): Promise<Response> {
        return this.makeRequest(url, 'DELETE', undefined, signal);
    };

    private async makeRequest<RequestPayload, ResponsePayload>(
        url: string,
        method = 'GET',
        data?: RequestPayload,
        signal?: AbortSignal,
    ): Promise<ResponsePayload> {
        const request = new Request(`${this.baseUrl}/${url}`, {
            method: method || 'GET',
            headers: new Headers({
                "Accept": "application/vnd.protonmail.v1+json",
                "Content-Type": "application/json",
                "Language": this.language,
                "x-pm-drive-sdk-version": `js@${VERSION}`,
            }),
            body: data && JSON.stringify(data),
        });

        const response = await this.fetch(request, signal);

        try {
            const result = await response.json();

            if (!response.ok || !isCodeOk(result.Code)) {
                throw apiErrorFactory({ response, result });
            }
            if (isCodeOkAsync(result.Code)) {
                this.logger.info(`${request.method} ${request.url}: deferred action`);
            }
            return result as ResponsePayload;
        } catch (error: unknown) {
            if (error instanceof ProtonDriveError) {
                throw error;
            }
            throw apiErrorFactory({ response });
        }
    }

    async getBlockStream(baseUrl: string, token: string, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
        const response = await this.makeStorageRequest('GET', baseUrl, token, undefined, signal);
        if (!response.body) {
            throw new Error(c('Error').t`File download failed due to empty response`);
        }
        return response.body;
    }

    async postBlockStream(baseUrl: string, token: string, data: BodyInit, signal?: AbortSignal): Promise<void> {
        await this.makeStorageRequest('POST', baseUrl, token, data, signal);
    }

    private async makeStorageRequest(method: 'GET' | 'POST', url: string, token: string, body?: BodyInit, signal?: AbortSignal): Promise<Response> {
        const request = new Request(`${url}`, {
            method,
            credentials: 'omit',
            headers: new Headers({
                "pm-storage-token": token,
            }),
            body,
        });

        const response = await this.fetch(request, signal);

        if (response.status >= 400) {
            try {
                const result = await response.json();
                throw apiErrorFactory({ response, result });
            } catch (error: unknown) {
                if (error instanceof ProtonDriveError) {
                    throw error;
                }
                throw apiErrorFactory({ response });
            }
        }
        return response;
    }

    // FIXME: add priority header
    // u=2 for interactive (user doing action, e.g., create folder),
    // u=4 for normal (user secondary action, e.g., refresh children listing),
    // u=5 for background (e.g., upload, download)
    // u=7 for optional (e.g., metrics, telemetry)
    private async fetch(
        request: Request,
        signal?: AbortSignal,
        attempt = 0
    ): Promise<Response> {
        if (signal?.aborted) {
            throw new AbortError(c('Error').t`Request aborted`);
        }

        this.logger.debug(`${request.method} ${request.url}`);

        if (this.hasReachedServerErrorLimit) {
            this.logger.warn('Server errors limit reached');
            throw new ServerError(c('Error').t`Too many server errors, please try again later`);
        }
        if (this.hasReachedTooManyRequestsErrorLimit) {
            this.logger.warn('Too many requests limit reached');
            throw new RateLimitedError(c('Error').t`Too many server requests, please try again later`);
        }

        let response;
        try {
            response = await this.httpClient.fetch(request, signal);
        } catch (error: unknown) {
            if (error instanceof Error) {
                if (error.name === 'OfflineError') {
                    this.logger.info(`${request.method} ${request.url}: Offline error, retrying`);
                    await waitSeconds(OFFLINE_RETRY_DELAY_SECONDS);
                    return this.fetch(request, signal, attempt+1);
                }

                if (error.name === 'TimeoutError') {
                    this.logger.warn(`${request.method} ${request.url}: Timeout error, retrying`);
                    await waitSeconds(SERVER_ERROR_RETRY_DELAY_SECONDS);
                    return this.fetch(request, signal, attempt+1);
                }
            }
            if (attempt === 0) {
                this.logger.error(`${request.method} ${request.url}: failed, retrying once`, error);
                await waitSeconds(GENERAL_RETRY_DELAY_SECONDS);
                return this.fetch(request, signal, attempt+1);
            }
            this.logger.error(`${request.method} ${request.url}: failed`, error);
            throw error;
        }

        if (response.ok) {
            this.logger.info(`${request.method} ${request.url}: ${response.status}`);
        } else {
            this.logger.warn(`${request.method} ${request.url}: ${response.status}`);
        }

        if (response.status === HTTPErrorCode.TOO_MANY_REQUESTS) {
            this.tooManyRequestsErrorHappened();
            const timeout = parseInt(response.headers.get('retry-after') || '0', DEFAULT_429_RETRY_DELAY_SECONDS);
            await waitSeconds(timeout);
            return this.fetch(request, signal, attempt+1);
        } else {
            this.clearSubsequentTooManyRequestsError();
        }

        // Automatically re-try 5xx glitches on the server, but only once
        // and report the incident so it can be followed up.
        if (response.status >= 500) {
            this.serverErrorHappened();

            if (attempt > 0) {
                this.logger.warn(`${request.method} ${request.url}: ${response.status} - retry failed`);
            } else {
                await waitSeconds(SERVER_ERROR_RETRY_DELAY_SECONDS);
                return this.fetch(request, signal, attempt+1);
            }
        } else {
            if (attempt > 0) {
                this.telemetry.logEvent({
                    eventName: 'apiRetrySucceeded',
                    failedAttempts: attempt,
                    url: request.url,
                });
                this.logger.warn(`${request.method} ${request.url}: ${response.status} - retry helped`);
            }
            this.clearSubsequentServerErrors();
        }

        return response;
    }

    private get hasReachedTooManyRequestsErrorLimit(): boolean {
        const secondsSinceLast429Error = (Date.now() - (this.lastTooManyRequestsErrorAt || Date.now())) / 1000;
        return (
            this.subsequentTooManyRequestsCounter >= TOO_MANY_SUBSEQUENT_429_ERRORS &&
            secondsSinceLast429Error < TOO_MANY_SUBSEQUENT_429_ERRORS_TIMEOUT_IN_SECONDS
        )
    }

    private tooManyRequestsErrorHappened() {
        this.subsequentTooManyRequestsCounter++;
        this.lastTooManyRequestsErrorAt = Date.now();

        // Do not emit event if there is first few 429 errors, only when
        // the client is very limited. This is generic event and it doesn't
        // take into account that various endpoints can be rate limited
        // independently.
        if (this.subsequentTooManyRequestsCounter >= TOO_MANY_SUBSEQUENT_429_ERRORS) {
            this.sdkEvents.requestsThrottled();
        }
    }

    private clearSubsequentTooManyRequestsError() {
        if (this.subsequentTooManyRequestsCounter >= TOO_MANY_SUBSEQUENT_429_ERRORS) {
            this.sdkEvents.requestsUnthrottled();
        }

        this.subsequentTooManyRequestsCounter = 0;
        this.lastTooManyRequestsErrorAt = undefined;
    }

    private get hasReachedServerErrorLimit(): boolean {
        const secondsSinceLastServerError = (Date.now() - (this.lastServerErrorAt || Date.now())) / 1000;
        return (
            this.subsequentServerErrorsCounter >= TOO_MANY_SUBSEQUENT_SERVER_ERRORS &&
            secondsSinceLastServerError < TOO_MANY_SUBSEQUENT_SERVER_ERRORS_TIMEOUT_IN_SECONDS
        )
    }

    private serverErrorHappened() {
        this.subsequentServerErrorsCounter++;
        this.lastServerErrorAt = Date.now();
    }

    private clearSubsequentServerErrors() {
        this.subsequentServerErrorsCounter = 0;
        this.lastServerErrorAt = undefined;
    }
}
