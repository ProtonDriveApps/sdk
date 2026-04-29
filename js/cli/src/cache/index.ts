import type { Logger, ProtonDriveCache } from '@protontech/drive-sdk';

import { Config } from '../config';
import { Credentials } from '../credentials';
import { EncryptedSQLiteEntitiesCache } from './encryptedCache';
import { SQLiteEntititesCache } from './sqliteCache';

export function createEntitiesCache(
    config: Config,
    credentials: Credentials,
    logger: Logger,
): ProtonDriveCache<string> {
    if (config.unsafeCache) {
        return new SQLiteEntititesCache(config.cacheDir);
    }
    return new EncryptedSQLiteEntitiesCache(
        config.cacheDir,
        async () => {
            return credentials.getCachePassword();
        },
        logger,
    );
}
