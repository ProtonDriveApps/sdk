import { HTTPError } from 'ky';

import type { paths as AuthPaths } from './api-auth-types';
import type { paths as CorePaths } from './api-core-types';
import { ApiClient } from './apiClient';

const ADDRESS_MISSING_CODE = 33_102;
const DOMAIN_EXTERNAL_CODE = 33_103;

type AuthResponse = Extract<
    CorePaths['/core/{_version}/auth/info']['post']['responses']['200']['content']['application/json'],
    { Modulus?: string }
>;

type SessionForkInitResponse = {
    Code: number;
    Selector: string;
    UserCode: string;
};

type SessionForkStatusResponse = {
    Code: number;
    Payload: string;
    UID: string;
    AccessToken: string;
    RefreshToken?: string;
};

type ApiErrorDetails = {
    Code?: unknown;
} & object;

async function makeAccountApiError(error: unknown): Promise<AccountApiError> {
    if (error instanceof AccountApiError) {
        return error;
    }
    if (error instanceof HTTPError) {
        const details = await parseErrorDetails(error.response);
        const code = typeof details?.Code === 'number' ? details.Code : 0;
        if (code === ADDRESS_MISSING_CODE || code === DOMAIN_EXTERNAL_CODE) {
            return new AddressNotFoundError(error.message, {
                httpCode: error.response.status,
                code,
                debug: details,
                cause: error,
            });
        }
        return new AccountApiError(error.message, {
            httpCode: error.response.status,
            code,
            debug: details,
            cause: error,
        });
    }
    const message = error instanceof Error ? error.message : String(error);
    return new AccountApiError(message, { cause: error });
}

async function parseErrorDetails(response: Response): Promise<ApiErrorDetails | undefined> {
    try {
        const parsed = await response.json();
        if (parsed !== null && typeof parsed === 'object') {
            return parsed as ApiErrorDetails;
        }
    } catch {
        // Ignore parsing errors and fall back to generic error details.
    }
    return undefined;
}

export class AccountApiError extends Error {
    public readonly httpCode?: number;
    public readonly code?: number;
    public readonly debug?: object;

    constructor(
        message: string,
        options: {
            httpCode?: number;
            code?: number;
            debug?: object;
            cause?: unknown;
        },
    ) {
        super(message, { cause: options.cause });
        this.name = 'AccountApiError';
        this.httpCode = options.httpCode;
        this.code = options.code;
        this.debug = options.debug;
    }
}

export class AddressNotFoundError extends AccountApiError {}

export class AccountApi {
    constructor(private readonly apiClient: ApiClient) {}

    async sessionForksInit(): Promise<SessionForkInitResponse> {
        try {
            return await this.apiClient.unauthenticatedRequest
                .get(`${this.apiClient.baseUrlWithProtocol}/auth/v4/sessions/forks`)
                .json<SessionForkInitResponse>();
        } catch (error: unknown) {
            throw await makeAccountApiError(error);
        }
    }

    async sessionForksStatus(selector: string): Promise<SessionForkStatusResponse> {
        try {
            return await this.apiClient.unauthenticatedRequest
                .get(`${this.apiClient.baseUrlWithProtocol}/auth/v4/sessions/forks/${encodeURIComponent(selector)}`)
                .json<SessionForkStatusResponse>();
        } catch (error: unknown) {
            throw await makeAccountApiError(error);
        }
    }

    async sessions(): Promise<
        AuthPaths['/auth/{_version}/sessions']['post']['responses']['200']['content']['application/json']
    > {
        try {
            const response = await this.apiClient.authenticatedRequest.post<
                AuthPaths['/auth/{_version}/sessions']['post']['responses']['200']['content']['application/json']
            >(`${this.apiClient.baseUrlWithProtocol}/auth/v4/sessions`, {
                headers: {
                    'x-enforce-unauthsession': 'true',
                },
            });
            return response.json();
        } catch (error: unknown) {
            throw await makeAccountApiError(error);
        }
    }

    async auth(data: {
        ClientEphemeral: string;
        ClientProof: string;
        Payload: { [key: string]: string };
        PersistentCookies: number;
        SRPSession: string;
        Username: string;
    }): Promise<CorePaths['/core/{_version}/auth']['post']['responses']['200']['content']['application/json']> {
        try {
            const response = await this.apiClient.unauthenticatedRequest
                .post<CorePaths['/core/{_version}/auth']['post']['responses']['200']['content']['application/json']>(
                    `${this.apiClient.baseUrlWithProtocol}/core/v4/auth`,
                    {
                        json: {
                            ...data,
                        },
                    },
                )
                .json();
            return response;
        } catch (error: unknown) {
            throw await makeAccountApiError(error);
        }
    }

    async info(Username: string): Promise<AuthResponse> {
        try {
            const response = await this.apiClient.unauthenticatedRequest
                .post<
                    CorePaths['/core/{_version}/auth/info']['post']['responses']['200']['content']['application/json']
                >(`${this.apiClient.baseUrlWithProtocol}/core/v4/auth/info`, {
                    json: {
                        Intent: 'Proton',
                        Username,
                    },
                })
                .json();

            if ('Modulus' in response) {
                return response;
            }
            throw new AccountApiError('Invalid auth response', { debug: response });
        } catch (error: unknown) {
            throw await makeAccountApiError(error);
        }
    }

    async users(): Promise<
        CorePaths['/core/{_version}/users']['get']['responses']['200']['content']['application/json']
    > {
        try {
            const response = await this.apiClient.authenticatedRequest
                .get<
                    CorePaths['/core/{_version}/users']['get']['responses']['200']['content']['application/json']
                >(`${this.apiClient.baseUrlWithProtocol}/core/v4/users`)
                .json();
            return response;
        } catch (error: unknown) {
            throw await makeAccountApiError(error);
        }
    }

    async addresses(): Promise<
        CorePaths['/core/{_version}/addresses']['get']['responses']['200']['content']['application/json']
    > {
        try {
            const response = await this.apiClient.authenticatedRequest
                .get<CorePaths['/core/{_version}/addresses']['get']['responses']['200']['content']['application/json']>(
                    `${this.apiClient.baseUrlWithProtocol}/core/v4/addresses`,
                    {
                        searchParams: {
                            Page: 0,
                            PageSize: 50,
                        },
                    },
                )
                .json();
            return response;
        } catch (error: unknown) {
            throw await makeAccountApiError(error);
        }
    }

    async salts(): Promise<
        CorePaths['/core/{_version}/keys/salts']['get']['responses']['200']['content']['application/json']
    > {
        try {
            const response = await this.apiClient.authenticatedRequest
                .get<
                    CorePaths['/core/{_version}/keys/salts']['get']['responses']['200']['content']['application/json']
                >(`${this.apiClient.baseUrlWithProtocol}/core/v4/keys/salts`)
                .json();
            return response;
        } catch (error: unknown) {
            throw await makeAccountApiError(error);
        }
    }

    async keys(
        email: string,
    ): Promise<CorePaths['/core/{_version}/keys/all']['get']['responses']['200']['content']['application/json']> {
        try {
            const response = await this.apiClient.authenticatedRequest
                .get<CorePaths['/core/{_version}/keys/all']['get']['responses']['200']['content']['application/json']>(
                    `${this.apiClient.baseUrlWithProtocol}/core/v4/keys/all`,
                    {
                        searchParams: {
                            Email: email,
                            InternalOnly: 1,
                        },
                    },
                )
                .json();
            return response;
        } catch (error: unknown) {
            throw await makeAccountApiError(error);
        }
    }

    async modulus(): Promise<
        CorePaths['/core/{_version}/auth/modulus']['get']['responses']['200']['content']['application/json']
    > {
        try {
            const response = await this.apiClient.authenticatedRequest
                .get<
                    CorePaths['/core/{_version}/auth/modulus']['get']['responses']['200']['content']['application/json']
                >(`${this.apiClient.baseUrlWithProtocol}/core/v4/auth/modulus`)
                .json();
            return response;
        } catch (error: unknown) {
            throw await makeAccountApiError(error);
        }
    }
}
