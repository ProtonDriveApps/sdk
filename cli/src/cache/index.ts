import path from 'node:path';

import type { CachedCryptoMaterial, Logger, ProtonDriveCache } from '@protontech/drive-sdk';

import { Config } from '../config';
import { Credentials } from '../credentials';
import { DriveCryptoCacheAdapter } from './driveCryptoCacheAdapter';
import { EncryptedSQLiteCache } from './encryptedCache';
import { SQLiteCache } from './sqliteCache';

const CRYPTO_CACHE_FILE = 'cache-crypto.sqlite';
const ENTITIES_CACHE_FILE = 'cache-entities.sqlite';

export function createCaches(
    config: Config,
    credentials: Credentials,
    logger: Logger,
): {
    entitiesCache: ProtonDriveCache<string>;
    cryptoCache: ProtonDriveCache<CachedCryptoMaterial>;
} {
    return {
        cryptoCache: createCryptoCache(logger, config, credentials),
        entitiesCache: createEntitiesCache(logger, config, credentials),
    };
}

function createCryptoCache(
    logger: Logger,
    config: Config,
    credentials: Credentials,
): ProtonDriveCache<CachedCryptoMaterial> {
    const cache = createCache(logger, config, credentials, CRYPTO_CACHE_FILE);
    return new DriveCryptoCacheAdapter(cache);
}

function createEntitiesCache(logger: Logger, config: Config, credentials: Credentials): ProtonDriveCache<string> {
    return createCache(logger, config, credentials, ENTITIES_CACHE_FILE);
}

function createCache(
    logger: Logger,
    config: Config,
    credentials: Credentials,
    cacheFileName: string,
): ProtonDriveCache<string> {
    const cacheFile = path.join(config.cacheDir, cacheFileName);
    if (config.unsafeCache) {
        return new SQLiteCache(cacheFile);
    }
    return new EncryptedSQLiteCache(
        cacheFile,
        async () => {
            return credentials.getCachePassword();
        },
        logger,
    );
}
