import ky, { type AfterResponseHook, type KyInstance } from 'ky';

import { Logger } from '@protontech/drive-sdk';

import type { Config } from '../config';
import { Credentials } from '../credentials';
import type { paths as AuthPaths } from './api-auth-types';
import { processDriveRequirementHeaders, SUPPORTED_REQUIREMENT_MASK_BY_SCOPE } from './apiRequirements';
import { MessageEmitter } from './messageEmitter';

const DEFAULT_TIMEOUT_MS = 30_000;

type RefreshResponseBody =
    AuthPaths['/auth/{_version}/refresh']['post']['responses']['200']['content']['application/json'];

export class ApiClient {
    private authenticatedClientBase: KyInstance;
    private authenticatedClient: KyInstance;
    private unauthenticatedClient: KyInstance;

    private activeRefreshPromise: Promise<boolean> | null = null;
    private readonly driveRequirementNoticeOnce = new MessageEmitter();

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
                'x-pm-drive-sdk-version': this.config.sdkVersion,
            },
            timeout: DEFAULT_TIMEOUT_MS,
        };
        const driveApiRequirementsHook = this.createDriveApiRequirementsAfterResponseHook();
        this.authenticatedClientBase = ky.create({
            ...baseClientOptions,
            hooks: {
                afterResponse: [this.createRefreshSessionAfterResponseHook(), driveApiRequirementsHook],
            },
        });
        this.authenticatedClient = this.authenticatedClientBase;
        this.unauthenticatedClient = ky.create({
            ...baseClientOptions,
            hooks: {
                afterResponse: [driveApiRequirementsHook],
            },
        });
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

    private createDriveApiRequirementsAfterResponseHook(): AfterResponseHook {
        return (_request, _options, response) => {
            processDriveRequirementHeaders(response.headers, {
                clientSdkVersion: this.config.sdkVersion ?? '',
                supportedRequirementMasksByScope: SUPPORTED_REQUIREMENT_MASK_BY_SCOPE,
                onUnsupportedFeature: (scope, requiredMask) => {
                    const message = `Update needed: unsupported feature for ${scope}`;
                    this.driveRequirementNoticeOnce.emitOnce(message, (msg) => {
                        this.logger.warn(`${msg} (required feature bit mask: ${requiredMask})`);
                        process.stderr.write(msg + '\n');
                    });
                },
                onRequiredUpdate: (requiredVersion) => {
                    const message = `Update required: required SDK version ${requiredVersion} or newer (currently using ${this.config.sdkVersion ?? '0.0.1'})`;
                    this.driveRequirementNoticeOnce.emitOnce(message, (msg) => {
                        this.logger.warn(msg);
                        process.stderr.write(msg + '\n');
                    });
                },
                onSuggestedUpdate: (suggestedVersion) => {
                    const message = `Update recommended: suggested SDK version ${suggestedVersion} or newer (currently using ${this.config.sdkVersion ?? '0.0.1'})`;
                    this.driveRequirementNoticeOnce.emitOnce(message, (msg) => {
                        this.logger.warn(msg);
                        process.stderr.write(msg + '\n');
                    });
                },
            });
        };
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
            this.logger.error('Failed to refresh session: missing UID or AccessToken');
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
