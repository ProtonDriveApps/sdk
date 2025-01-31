import { ProtonDriveConfig } from './interface/index.js';

export function getConfig(config?: ProtonDriveConfig) {
    return {
        baseUrl: config?.baseUrl || 'https://drive.proton.me/api',
        language: config?.language || 'en',
        // TODO: add defaults for all fields
        ...config,
    };
}
