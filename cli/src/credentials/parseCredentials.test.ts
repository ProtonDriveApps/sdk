import { parseStoredSnapshot } from './parseCredentials';

function validSnapshot(overrides: Record<string, unknown> = {}) {
    return JSON.stringify({
        userKeyPassword: 'user-key-pass',
        session: {
            uid: 'uid-1',
            accessToken: 'access-token',
        },
        ...overrides,
    });
}

describe('parseStoredSnapshot', () => {
    it('returns null for invalid inputs', () => {
        expect(parseStoredSnapshot(null)).toBeNull();
        expect(parseStoredSnapshot('')).toBeNull();
        expect(parseStoredSnapshot('{not json')).toBeNull();
    });

    it('parses a minimal valid snapshot', () => {
        const raw = validSnapshot();
        expect(parseStoredSnapshot(raw)).toEqual({
            cachePassword: undefined,
            userKeyPassword: 'user-key-pass',
            session: {
                uid: 'uid-1',
                accessToken: 'access-token',
                refreshToken: undefined,
            },
        });
    });

    it('parses a valid snapshot with optional cachePassword and refreshToken', () => {
        const raw = validSnapshot({
            cachePassword: 'cached',
            session: {
                uid: 'uid-1',
                accessToken: 'access-token',
                refreshToken: 'refresh',
            },
        });
        expect(parseStoredSnapshot(raw)).toEqual({
            cachePassword: 'cached',
            userKeyPassword: 'user-key-pass',
            session: {
                uid: 'uid-1',
                accessToken: 'access-token',
                refreshToken: 'refresh',
            },
        });
    });

    it('returns null when cachePassword is present but not a string', () => {
        expect(parseStoredSnapshot(validSnapshot({ cachePassword: true }))).toBeNull();
    });

    it('returns null when userKeyPassword is missing or not a non-empty string', () => {
        expect(parseStoredSnapshot(validSnapshot({ userKeyPassword: undefined }))).toBeNull();
        expect(parseStoredSnapshot(validSnapshot({ userKeyPassword: '' }))).toBeNull();
        expect(parseStoredSnapshot(validSnapshot({ userKeyPassword: 1 }))).toBeNull();
    });

    it('returns null when session is missing or not an object', () => {
        expect(parseStoredSnapshot(validSnapshot({ session: undefined }))).toBeNull();
        expect(parseStoredSnapshot(validSnapshot({ session: 'not an object' }))).toBeNull();
    });

    it('returns null when uid is missing or not a non-empty string', () => {
        expect(parseStoredSnapshot(validSnapshot({ session: { accessToken: 'a' } }))).toBeNull();
        expect(parseStoredSnapshot(validSnapshot({ session: { uid: '', accessToken: 'a' } }))).toBeNull();
        expect(parseStoredSnapshot(validSnapshot({ session: { uid: 1, accessToken: 'a' } }))).toBeNull();
    });

    it('returns null when accessToken is missing or not a non-empty string', () => {
        expect(parseStoredSnapshot(validSnapshot({ session: { uid: 'u' } }))).toBeNull();
        expect(parseStoredSnapshot(validSnapshot({ session: { uid: 'u', accessToken: '' } }))).toBeNull();
        expect(parseStoredSnapshot(validSnapshot({ session: { uid: 'u', accessToken: false } }))).toBeNull();
    });

    it('returns null when refreshToken is present but not a string', () => {
        expect(
            parseStoredSnapshot(
                validSnapshot({ session: { uid: 'u', accessToken: 'a', refreshToken: ['x'] } }),
            ),
        ).toBeNull();
    });
});
