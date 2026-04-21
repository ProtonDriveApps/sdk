import ky, { type AfterResponseHook, type KyInstance } from 'ky';

import { Logger } from '../../../sdk/src';
import type { Config } from '../config';
import { Credentials } from '../credentials';
import type { paths as AuthPaths } from './api-auth-types';

const DEFAULT_TIMEOUT_MS = 30_000;

type RefreshResponseBody =
    AuthPaths['/auth/{_version}/refresh']['post']['responses']['200']['content']['application/json'];

export class ApiClient {
    private authenticatedClientBase: KyInstance;
    private authenticatedClient: KyInstance;
    private unauthenticatedClient: KyInstance;

    private activeRefreshPromise: Promise<boolean> | null = null;

    readonly baseUrlWithProtocol: string;

    constructor(
        private readonly config: Config,
        private readonly credentials: Credentials,
        private readonly logger: Logger,
    ) {
        const baseUrl = this.config.baseUrl;
        this.baseUrlWithProtocol = baseUrl.match(/^https?:\/\//) ? baseUrl : `https://${baseUrl}`;

        const baseClientOptions = {
            headers: {
                'x-pm-appversion': this.config.appVersion,
            },
            timeout: DEFAULT_TIMEOUT_MS,
        };
        this.authenticatedClientBase = ky.create({
            ...baseClientOptions,
            hooks: {
                afterResponse: [this.createRefreshSessionAfterResponseHook()],
            },
        });
        this.authenticatedClient = this.authenticatedClientBase;
        this.unauthenticatedClient = ky.create(baseClientOptions);
        this.updateAuthenticatedClientHeaders();

        credentials.on('sessionInfoChanged', () => this.updateAuthenticatedClientHeaders());
    }

    private updateAuthenticatedClientHeaders() {
        this.authenticatedClient = this.authenticatedClientBase.extend({
            headers: {
                ...(this.credentials.uid && { 'x-pm-uid': this.credentials.uid }),
                ...(this.credentials.accessToken && { Authorization: `Bearer ${this.credentials.accessToken}` }),
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

            this.logger.info('Refreshing session');

            const refreshed = await this.refreshSessionIfPossible();
            if (!refreshed) {
                return;
            }

            const uid = this.credentials.uid;
            const accessToken = this.credentials.accessToken;
            if (!uid || !accessToken) {
                return;
            }

            const headers = new Headers(options.headers);
            headers.set('x-pm-appversion', this.config.appVersion);
            headers.set('x-pm-uid', uid);
            headers.set('Authorization', `Bearer ${accessToken}`);
            options.headers = headers;

            return this.authenticatedClient(request, options);
        };
    }

    async refreshSessionIfPossible(): Promise<boolean> {
        this.activeRefreshPromise ??= this.performTokenRefresh().finally(() => {
            this.activeRefreshPromise = null;
        });
        return this.activeRefreshPromise;
    }

    private async performTokenRefresh(): Promise<boolean> {
        const refreshToken = this.credentials.refreshToken;
        if (!refreshToken) {
            this.logger.warn('Failed to refresh session: missing RefreshToken');
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
            this.logger.error('Failed to refresh session', response);
            if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                await this.credentials.signOut();
            }
            return false;
        }

        const data = (await response.json()) as RefreshResponseBody;
        const uid = data.UID ?? this.credentials.uid;
        const accessToken = data.AccessToken;
        if (!uid || !accessToken) {
            this.logger.error('Failed to refresh session: missing UID or AccessToken', data);
            return false;
        }

        await this.credentials.setSessionInfo({
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
