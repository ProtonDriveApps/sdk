import type { Logger, ProtonDriveCache } from '../../../sdk/src';
import { Credentials } from '../credentials';
import { Config } from '../config';
import { SQLiteEntititesCache } from './sqliteCache';
import { EncryptedSQLiteEntitiesCache } from './encryptedCache';

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
