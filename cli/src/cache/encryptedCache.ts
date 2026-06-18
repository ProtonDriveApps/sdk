import { Logger } from '@protontech/drive-sdk';

import { decryptCacheValue, encryptCacheValue } from './crypto';
import { SQLiteCache } from './sqliteCache';

/**
 * SQLite cache that encrypts values at rest (HKDF-SHA256 + AES-256-GCM),
 * matching `Proton.Sdk.Caching.EncryptedCacheRepository` in the C# SDK.
 */
export class EncryptedSQLiteCache extends SQLiteCache {
    private encryptionKeyMaterialPromise?: Promise<Buffer>;

    constructor(
        cacheFile: string,
        private readonly getEncryptionPassword: () => Promise<string>,
        private readonly logger: Logger,
    ) {
        super(cacheFile);
    }

    override async setEntity(key: string, data: string, tags?: string[]) {
        const encrypted = encryptCacheValue(key, data, await this.getEncryptionKeyMaterial());
        await super.setEntity(key, encrypted, tags);
    }

    override async getEntity(key: string) {
        const encrypted = await super.getEntity(key);
        try {
            return decryptCacheValue(key, encrypted, await this.getEncryptionKeyMaterial());
        } catch (error: unknown) {
            this.logger.error(`Failed to decrypt entity ${key}, clearing cache`, error);
            await this.clear();
            throw Error(`Entity ${key} not found`);
        }
    }

    private async getEncryptionKeyMaterial(): Promise<Buffer> {
        if (!this.encryptionKeyMaterialPromise) {
            this.encryptionKeyMaterialPromise = (async () => {
                try {
                    const keyMaterial = Buffer.from(await this.getEncryptionPassword(), 'base64');
                    return keyMaterial;
                } catch (error: unknown) {
                    this.logger.error(`Failed to get encryption key material`, error);
                    this.encryptionKeyMaterialPromise = undefined;
                    throw error;
                }
            })();
        }
        return this.encryptionKeyMaterialPromise;
    }
}
