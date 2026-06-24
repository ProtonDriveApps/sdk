export type SessionInfo = {
    uid: string;
    accessToken: string;
    refreshToken?: string;
};

/**
 * Session state used by the account module. Implementations are provided by the host (e.g. CLI).
 */
export interface SessionCredentials {
    readonly uid: string | undefined;
    readonly accessToken: string | undefined;
    readonly refreshToken: string | undefined;

    on(event: 'sessionInfoChanged', callback: () => void): void;

    isLoggedIn(): boolean;
    getUserKeyPassword(): string | undefined;
    load(): Promise<void>;
    setUserKeyPassword(userKeyPassword: string): Promise<void>;
    setSessionInfo(info: SessionInfo): Promise<void>;
    signOut(): Promise<void>;
}
