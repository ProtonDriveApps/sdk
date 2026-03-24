import { ProtonDriveConfig } from './interface';

/**
 * Parsed configuration of `ProtonDriveConfig`.
 *
 * The object should be almost identical to the original config, but making
 * some fields required (setting reasonable defaults for the missing fields),
 * or changed for easier usage inside of the SDK.
 *
 * For more property details, see the original config declaration.
 */
type ParsedProtonDriveConfig = {
    baseUrl: string;
    language: string;
    clientUid?: string;
    upload: {
        encryptionConcurrency: number;
        maxBufferedBlocks: number;
        maxUploadingBlocks: number;
        maxConcurrentFileUploads: number;
        maxConcurrentUploadSizeInBlocks: number;
        useWorkerHashing: boolean;
        cryptoWorkerPoolSize?: number;
    };
};

function clampAtLeastOne(value: number | undefined, fallback: number): number {
    if (value === undefined || Number.isNaN(value)) {
        return fallback;
    }
    return Math.max(1, Math.floor(value));
}

function getHardwareConcurrency(): number {
    const runtime = globalThis as { navigator?: { hardwareConcurrency?: number } };
    return runtime.navigator?.hardwareConcurrency || 4;
}

export function getConfig(config?: ProtonDriveConfig): ParsedProtonDriveConfig {
    const hardwareConcurrency = getHardwareConcurrency();
    const defaultEncryptionConcurrency = Math.max(2, Math.min(6, Math.floor(hardwareConcurrency / 2) || 2));

    return {
        baseUrl: config?.baseUrl ? `https://${config.baseUrl}` : 'https://drive-api.proton.me',
        language: config?.language || 'en',
        clientUid: config?.clientUid,
        upload: {
            encryptionConcurrency: clampAtLeastOne(
                config?.upload?.encryptionConcurrency,
                defaultEncryptionConcurrency,
            ),
            maxBufferedBlocks: clampAtLeastOne(config?.upload?.maxBufferedBlocks, 24),
            maxUploadingBlocks: clampAtLeastOne(config?.upload?.maxUploadingBlocks, 8),
            maxConcurrentFileUploads: clampAtLeastOne(config?.upload?.maxConcurrentFileUploads, 8),
            maxConcurrentUploadSizeInBlocks: clampAtLeastOne(
                config?.upload?.maxConcurrentUploadSizeInBlocks,
                16,
            ),
            useWorkerHashing: config?.upload?.useWorkerHashing ?? true,
            cryptoWorkerPoolSize:
                config?.upload?.cryptoWorkerPoolSize !== undefined
                    ? clampAtLeastOne(config.upload.cryptoWorkerPoolSize, defaultEncryptionConcurrency)
                    : undefined,
        },
    };
}
