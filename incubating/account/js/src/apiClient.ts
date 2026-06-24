import ky, { type AfterResponseHook, type KyInstance } from 'ky';

import type { paths as AuthPaths } from './api-auth-types';
import type { Logger } from './logger';
import type { SessionCredentials } from './sessionCredentials';

const DEFAULT_TIMEOUT_MS = 30_000;

type RefreshResponseBody =
    AuthPaths['/auth/{_version}/refresh']['post']['responses']['200']['content']['application/json'];

export type ApiClientOptions = {
    baseUrl: string;
    appVersion: string;
    credentials: SessionCredentials;
    logger: Logger;
    headers?: Record<string, string | undefined>;
    afterResponseHooks?: AfterResponseHook[];
};

export class ApiClient {
    private authenticatedClientBase: KyInstance;
    private authenticatedClient: KyInstance;
    private unauthenticatedClient: KyInstance;

    private activeRefreshPromise: Promise<boolean> | null = null;

    readonly baseUrlWithProtocol: string;

    constructor(private readonly options: ApiClientOptions) {
        const baseUrl = options.baseUrl;
        this.baseUrlWithProtocol = baseUrl.match(/^https?:\/\//) ? baseUrl : `https://${baseUrl}`;

        const requestHeaders = {
            'x-pm-appversion': options.appVersion,
            ...options.headers,
        };
        const baseClientOptions = {
            headers: Object.fromEntries(
                Object.entries(requestHeaders).filter((entry): entry is [string, string] => entry[1] !== undefined),
            ),
            timeout: DEFAULT_TIMEOUT_MS,
        };
        const afterResponseHooks = options.afterResponseHooks ?? [];
        this.authenticatedClientBase = ky.create({
            ...baseClientOptions,
            hooks: {
                afterResponse: [this.createRefreshSessionAfterResponseHook(), ...afterResponseHooks],
            },
        });
        this.authenticatedClient = this.authenticatedClientBase;
        this.unauthenticatedClient = ky.create({
            ...baseClientOptions,
            hooks: {
                afterResponse: afterResponseHooks,
            },
        });
        this.updateAuthenticatedClientHeaders();

        options.credentials.on('sessionInfoChanged', () => this.updateAuthenticatedClientHeaders());
    }

    private updateAuthenticatedClientHeaders() {
        this.authenticatedClient = this.authenticatedClientBase.extend({
            headers: {
                ...(this.options.credentials.uid && { 'x-pm-uid': this.options.credentials.uid }),
                ...(this.options.credentials.accessToken && {
                    Authorization: `Bearer ${this.options.credentials.accessToken}`,
                }),
            },
        });
    }

    get authenticatedRequest(): KyInstance {
        return this.authenticatedClient;
    }

    get unauthenticatedRequest(): KyInstance {
        return this.unauthenticatedClient;
    }

    private createRefreshSessionAfterResponseHook(): AfterResponseHook {
        return async (request, options, response) => {
            if (response.status !== 401 || shouldSkipAuthRefreshForUrl(request.url)) {
                return;
            }

            this.options.logger.info('Refreshing session');

            const refreshed = await this.refreshSessionIfPossible();
            if (!refreshed) {
                return;
            }

            const uid = this.options.credentials.uid;
            const accessToken = this.options.credentials.accessToken;
            if (!uid || !accessToken) {
                return;
            }

            const headers = new Headers(options.headers);
            headers.set('x-pm-appversion', this.options.appVersion);
            headers.set('x-pm-uid', uid);
            headers.set('Authorization', `Bearer ${accessToken}`);

            return this.authenticatedClient(request, { ...options, headers });
        };
    }

    async refreshSessionIfPossible(): Promise<boolean> {
        this.activeRefreshPromise ??= this.performTokenRefresh().finally(() => {
            this.activeRefreshPromise = null;
        });
        return this.activeRefreshPromise;
    }

    private async performTokenRefresh(): Promise<boolean> {
        const refreshToken = this.options.credentials.refreshToken;
        if (!refreshToken) {
            this.options.logger.warn('Failed to refresh session: missing RefreshToken');
            return false;
        }

        const response = await this.authenticatedClient.post(`${this.baseUrlWithProtocol}/auth/v4/refresh`, {
            json: {
                ResponseType: 'token',
                GrantType: 'refresh_token',
                RefreshToken: refreshToken,
            },
            throwHttpErrors: false,
        });

        if (!response.ok) {
            this.options.logger.error('Failed to refresh session', response);
            if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                await this.options.credentials.signOut();
            }
            return false;
        }

        const data = (await response.json()) as RefreshResponseBody;
        const uid = data.UID ?? this.options.credentials.uid;
        const accessToken = data.AccessToken;
        if (!uid || !accessToken) {
            this.options.logger.error('Failed to refresh session: missing UID or AccessToken');
            return false;
        }

        await this.options.credentials.setSessionInfo({
            uid,
            accessToken,
            refreshToken: data.RefreshToken ?? refreshToken,
        });
        return true;
    }
}

function shouldSkipAuthRefreshForUrl(url: string): boolean {
    let pathname: string;
    try {
        pathname = new URL(url).pathname.toLowerCase();
    } catch {
        pathname = url.toLowerCase();
    }
    if (pathname.includes('/auth/v4/refresh')) {
        return true;
    }
    if (pathname.includes('/auth/v4/sessions')) {
        return true;
    }
    if (pathname.includes('/core/v4/auth')) {
        return true;
    }
    return false;
}
