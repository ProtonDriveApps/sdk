export type Credentials = {
    cachePassword?: string;
    userKeyPassword: string;
    session: SessionInfo;
};

export type SessionInfo = {
    uid: string;
    accessToken: string;
    refreshToken?: string;
};

export interface CredentialsStore {
    load(): Promise<Credentials | null>;
    save(snapshot: Credentials): Promise<void>;
    remove(): Promise<void>;
}
