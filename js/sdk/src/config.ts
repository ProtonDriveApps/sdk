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
};

export function getConfig(config?: ProtonDriveConfig): ParsedProtonDriveConfig {
    return {
        baseUrl: config?.baseUrl ? `https://${config.baseUrl}` : 'https://drive-api.proton.me',
        language: config?.language || 'en',
        clientUid: config?.clientUid,
    };
}
