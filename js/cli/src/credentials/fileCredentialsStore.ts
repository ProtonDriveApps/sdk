import { unlink } from 'node:fs/promises';
import path from 'node:path';

import { Logger } from '@protontech/drive-sdk';

import type { Credentials, CredentialsStore } from './interface';
import { parseStoredSnapshot } from './parseCredentials';

const UNSAFE_SESSION_FILENAME = 'auth-session.json';

export class PlaintextFileSessionStore implements CredentialsStore {
    private readonly filePath: string;

    constructor(private readonly cacheDir: string, private readonly logger: Logger) {
        this.filePath = path.join(this.cacheDir, UNSAFE_SESSION_FILENAME);
    }

    async load(): Promise<Credentials | null> {
        const file = Bun.file(this.filePath);
        if (!(await file.exists())) {
            this.logger.debug(`Session file does not exist: ${this.filePath}`);
            return null;
        }
        this.logger.debug(`Loading session from file: ${this.filePath}`);
        return parseStoredSnapshot(await file.text());
    }

    async save(snapshot: Credentials): Promise<void> {
        this.logger.debug(`Saving session to file: ${this.filePath}`);
        await Bun.write(this.filePath, JSON.stringify(snapshot), { mode: 0o600 });
    }

    async remove(): Promise<void> {
        this.logger.debug(`Removing session file: ${this.filePath}`);
        try {
            await unlink(this.filePath);
        } catch (err: unknown) {
            const code = err && typeof err === 'object' && 'code' in err ? (err as NodeJS.ErrnoException).code : undefined;
            if (code !== 'ENOENT') {
                throw err;
            }
        }
    }
}
