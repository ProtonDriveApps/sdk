import { randomBytes } from 'node:crypto';

import { Logger } from '@protontech/drive-sdk';

import type { CredentialsStore, SessionInfo } from './interface';

export class Credentials {
    private cachePassword?: string;
    private userKeyPassword?: string;
    private sessionInfo?: SessionInfo;

    private readonly sessionInfoChangedCallbacks = new Set<() => void>();

    constructor(
        private readonly store: CredentialsStore,
        private readonly logger: Logger,
    ) {}

    on(_: 'sessionInfoChanged', callback: () => void): void {
        this.sessionInfoChangedCallbacks.add(callback as () => void);
    }

    isLoggedIn(): boolean {
        return !!this.userKeyPassword && !!this.sessionInfo;
    }

    getUserKeyPassword(): string | undefined {
        return this.userKeyPassword;
    }

    async getCachePassword(): Promise<string> {
        if (!this.cachePassword) {
            this.cachePassword = randomBytes(32).toString('base64');
            await this.persistCredentials();
        }
        return this.cachePassword;
    }

    get uid(): string | undefined {
        return this.sessionInfo?.uid;
    }

    get accessToken(): string | undefined {
        return this.sessionInfo?.accessToken;
    }

    get refreshToken(): string | undefined {
        return this.sessionInfo?.refreshToken;
    }

    async load(): Promise<void> {
        const raw = await this.store.load();
        if (!raw) {
            this.logger.debug(`No session loaded`);
            return;
        }
        this.cachePassword = raw.cachePassword;
        this.userKeyPassword = raw.userKeyPassword;
        this.sessionInfo = raw.session;
        this.notifySessionInfoChanged();
    }

    async setUserKeyPassword(userKeyPassword: string): Promise<void> {
        this.userKeyPassword = userKeyPassword;
        await this.persistCredentials();
        this.notifySessionInfoChanged();
    }

    async setSessionInfo(info: SessionInfo): Promise<void> {
        this.sessionInfo = info;
        await this.persistCredentials();
        this.notifySessionInfoChanged();
    }

    async signOut(): Promise<void> {
        this.logger.debug(`Signing out`);
        this.userKeyPassword = undefined;
        this.sessionInfo = undefined;
        await this.store.remove();
        this.notifySessionInfoChanged();
    }

    private async persistCredentials(): Promise<void> {
        if (!this.userKeyPassword || !this.sessionInfo) {
            return;
        }
        await this.store.save({
            cachePassword: this.cachePassword,
            userKeyPassword: this.userKeyPassword,
            session: this.sessionInfo,
        });
    }

    private notifySessionInfoChanged(): void {
        this.sessionInfoChangedCallbacks.forEach((callback) => callback());
    }
}
