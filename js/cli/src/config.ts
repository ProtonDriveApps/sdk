import { LogLevel } from '@protontech/drive-sdk/telemetry';

export interface InitConfig {
    enableConsoleLog?: boolean;
    appVersion: string;
    sdkVersion?: string;
    clientUidPrefix: string;
    enablePersistedEvents?: boolean;
    flags?: Record<string, boolean>;
}

export interface Config {
    clientUidPrefix: string;
    appVersion: string;
    sdkVersion?: string;
    baseUrl: string;
    cacheDir: string;
    enablePersistedEvents: boolean;
    enableConsoleLog: boolean;
    logLevel: LogLevel;
    unsafeSecrets: boolean;
    unsafeCache: boolean;
}

export function getConfig(options: InitConfig): Config {
    const unsafeSecrets = ['yes', 'y', '1', 'true'].includes(
        process.env.PROTON_DRIVE_UNSAFE_SECRETS?.toLowerCase() ?? '',
    );

    const logLevelOption = process.env.PROTON_DRIVE_LOG_LEVEL?.toUpperCase() ?? 'DEBUG';
    const logLevel = LogLevel[logLevelOption as keyof typeof LogLevel] ?? LogLevel.DEBUG;

    return {
        clientUidPrefix: options.clientUidPrefix,
        appVersion: options.appVersion,
        sdkVersion: options.sdkVersion,
        baseUrl: process.env.PROTON_DRIVE_BASE_URL || 'drive-api.proton.me',
        cacheDir: process.env.PROTON_DRIVE_CACHE_DIR || process.cwd(),
        enablePersistedEvents: options.enablePersistedEvents || false,
        enableConsoleLog: options.enableConsoleLog || false,
        logLevel,
        unsafeSecrets,
        unsafeCache: unsafeSecrets,
    };
}
