import { ProtonDriveConfig } from './interface';

export function getConfig(config?: ProtonDriveConfig) {
    return {
        // TODO: add defaults for all fields
        ...config,
        baseUrl: config?.baseUrl ? `https://${config.baseUrl}/api` : 'https://drive.proton.me/api',
        language: config?.language || 'en',
    };
}
