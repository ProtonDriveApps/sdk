import type { Credentials } from "./interface";

export function parseStoredSnapshot(raw: string | null): Credentials | null {
    if (raw == null || raw === '') {
        return null;
    }
    try {
        const session = JSON.parse(raw) as Credentials;
        if (
            (session.cachePassword && typeof session.cachePassword !== 'string') ||
            !session.userKeyPassword ||
            typeof session.userKeyPassword !== 'string' ||
            !session.session?.uid ||
            typeof session.session.uid !== 'string' ||
            !session.session?.accessToken ||
            typeof session.session.accessToken !== 'string' ||
            (session.session?.refreshToken && typeof session.session.refreshToken !== 'string')
        ) {
            return null;
        }
        return {
            cachePassword: session.cachePassword,
            userKeyPassword: session.userKeyPassword,
            session: {
                uid: session.session.uid,
                accessToken: session.session.accessToken,
                refreshToken: session.session.refreshToken,
            },
        };
    } catch {
        return null;
    }
}
