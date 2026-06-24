import type { SessionInfo } from 'proton-drive-sdk-account';

export type { SessionInfo };

export type Credentials = {
    cachePassword?: string;
    userKeyPassword: string;
    session: SessionInfo;
};

export interface CredentialsStore {
    load(): Promise<Credentials | null>;
    save(snapshot: Credentials): Promise<void>;
    remove(): Promise<void>;
}
