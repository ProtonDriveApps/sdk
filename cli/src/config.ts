import { homedir } from 'node:os';
import path from 'node:path';

import { LogLevel } from '@protontech/drive-sdk/telemetry';

const APP_DIR_NAME = 'proton-drive-cli';

export interface InitConfig {
    appVersion: string;
    sdkVersion?: string;
    clientUidPrefix: string;
    enablePersistedEvents?: boolean;
    enableConsoleLog?: boolean;
    enableMetrics?: boolean;
    flags?: Record<string, boolean>;
}

export interface Config {
    /** Client UID is auto generated at the first run with a given prefix. */
    clientUidPrefix: string;
    /** Version of the CLI. */
    appVersion: string;
    /** Client ID for the authentication. cli-drive for the official CLI, external-drive for 3p forks. */
    authClientId: string;
    /** Version of the SDK used by the CLI. */
    sdkVersion?: string;
    /** Base URL for the API. */
    baseUrl: string;

    /** Cache folder for ephemeral files (cryptographic cache, etc.). */
    cacheDir: string;
    /** App data folder for persistent files (events, client UID, etc.). */
    appDir: string;
    /** Folder for storing log files. */
    logDir: string;

    /** Whether to enable persisted events, stored in the app data folder. */
    enablePersistedEvents: boolean;
    /** Whether to enable printing logs to the console. */
    enableConsoleLog: boolean;
    /** Whether to enable sending anonymized operational metrics. */
    enableMetrics: boolean;
    /** Level of logging to both console and log file. */
    logLevel: LogLevel;

    /** Only for testing: store secrets in the app data folder instead of keychain. */
    unsafeSecrets: boolean;
    /** Only for testing: store cryptographic cache unencrypted. */
    unsafeCache: boolean;
}

export function getConfig(options: InitConfig): Config {
    const unsafeSecrets = ['yes', 'y', '1', 'true'].includes(
        process.env.PROTON_DRIVE_UNSAFE_SECRETS?.toLowerCase() ?? '',
    );

    const logLevelOption = process.env.PROTON_DRIVE_LOG_LEVEL?.toUpperCase() ?? 'DEBUG';
    const logLevel = LogLevel[logLevelOption as keyof typeof LogLevel] ?? LogLevel.DEBUG;

    const { cacheDir, appDir, logDir } = defaultDataDirs();

    return {
        clientUidPrefix: options.clientUidPrefix,
        appVersion: options.appVersion,
        authClientId: options.appVersion.startsWith('cli-drive') ? 'cli-drive' : 'external-drive',
        sdkVersion: options.sdkVersion,
        baseUrl: process.env.PROTON_DRIVE_BASE_URL || 'drive-api.proton.me',
        cacheDir,
        appDir,
        logDir,
        enablePersistedEvents: options.enablePersistedEvents || false,
        enableConsoleLog: options.enableConsoleLog || false,
        enableMetrics: options.enableMetrics || false,
        logLevel,
        unsafeSecrets,
        unsafeCache: unsafeSecrets,
    };
}

function defaultDataDirs(): Pick<Config, 'cacheDir' | 'appDir' | 'logDir'> {
    const home = homedir();
    const override = process.env.PROTON_DRIVE_CACHE_DIR;
    if (override) {
        return { cacheDir: override, appDir: override, logDir: override };
    }

    if (process.platform === 'darwin') {
        return {
            cacheDir: path.join(home, 'Library', 'Caches', APP_DIR_NAME),
            appDir: path.join(home, 'Library', 'Application Support', APP_DIR_NAME),
            logDir: path.join(home, 'Library', 'Logs', APP_DIR_NAME),
        };
    }

    if (process.platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
        const root = path.join(localAppData, APP_DIR_NAME);
        return {
            cacheDir: path.join(root, 'Cache'),
            appDir: path.join(root, 'Data'),
            logDir: path.join(root, 'Logs'),
        };
    }

    const xdgCache = process.env.XDG_CACHE_HOME || path.join(home, '.cache');
    const xdgData = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');
    const xdgState = process.env.XDG_STATE_HOME || path.join(home, '.local', 'state');
    return {
        cacheDir: path.join(xdgCache, APP_DIR_NAME),
        appDir: path.join(xdgData, APP_DIR_NAME),
        logDir: path.join(xdgState, APP_DIR_NAME),
    };
}
