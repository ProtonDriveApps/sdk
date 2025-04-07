import { ProtonDriveConfig } from './interface';

export function getConfig(config?: ProtonDriveConfig): Required<ProtonDriveConfig> {
    return {
        ...config,
        baseUrl: config?.baseUrl ? `https://${config.baseUrl}` : 'https://drive-api.proton.me',
        language: config?.language || 'en',
    };
}
