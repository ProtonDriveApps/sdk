export interface InitConfig {
    debug?: boolean;
    appVersion: string;
    clientUid: string;
}

export interface Config {
    clientUid: string;
    appVersion: string;
    baseUrl: string;
    cacheDir: string;
    enableConsoleLog: boolean;
    unsafeSecrets: boolean;
    unsafeCache: boolean;
}

export function getConfig(options: InitConfig): Config {
    const unsafeSecrets = ['yes', 'y', '1', 'true'].includes(
        process.env.PROTON_DRIVE_UNSAFE_SECRETS?.toLowerCase() ?? '',
    );

    return {
        clientUid: options.clientUid,
        appVersion: options.appVersion,
        baseUrl: process.env.PROTON_DRIVE_BASE_URL || 'drive-api.proton.me',
        cacheDir: process.env.PROTON_DRIVE_CACHE_DIR || process.cwd(),
        enableConsoleLog: options.debug ?? false,
        unsafeSecrets,
        unsafeCache: unsafeSecrets,
    };
}
