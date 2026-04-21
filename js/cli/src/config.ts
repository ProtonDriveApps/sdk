export interface Config {
    appVersion: string;
    baseUrl: string;
    cacheDir: string;
    enableConsoleLog: boolean;
    unsafeSecrets: boolean;
    unsafeCache: boolean;
}

export function getConfig(debug: boolean): Config {
    const unsafeSecrets = ['yes', 'y', '1', 'true'].includes(
        process.env.PROTON_DRIVE_UNSAFE_SECRETS?.toLowerCase() ?? '',
    );

    return {
        // App version must have two or three parts, no more or less, separated by dash.
        // First part is platform name, second is product name, third is optional section.
        // That's why we have sdkclijs instead of sdk-cli-js.
        appVersion: 'external-drive-sdkclijs@1.0.0',
        baseUrl: process.env.PROTON_DRIVE_BASE_URL || 'drive-api.proton.me',
        cacheDir: process.env.PROTON_DRIVE_CACHE_DIR || process.cwd(),
        enableConsoleLog: debug,
        unsafeSecrets,
        unsafeCache: unsafeSecrets,
    };
}
