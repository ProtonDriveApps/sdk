import { Account } from './account/account';
import { Srp } from './account/srp';
import { SQLiteEntititesCache } from './cache';
import { Paths } from './cli/paths';
import { Api as CryptoApi } from './crypto/lib/worker/api';
import { HTTPClient } from './httpClient';
import { initTelemetry } from './telemetry';

import { ProtonDriveClient, MemoryCache, CachedCryptoMaterial, OpenPGPCryptoWithCryptoProxy } from '../../sdk/src';
import { ProtonDrivePhotosClient } from '../../sdk/src/protonDrivePhotosClient';
import { initDiagnostic } from '../../sdk/src/diagnostic';

interface Config {
    appVersion: string;
    baseUrl: string;
    cacheDir: string;
    enableConsoleLog: boolean;
    uid?: string;
    accessToken?: string;
}

export async function init() {
    const cryptoApi = initCrypto();
    const config = getConfig();
    const account = await initAccount(cryptoApi, config);
    const srp = await initSrp(cryptoApi, config);
    const sdk = initSDK(cryptoApi, config, account, srp);
    const photosSdk = initPhotosSDK(cryptoApi, config, account, srp);
    const sdkDiagnostic = initSDKDiagnostic(cryptoApi, config, account, srp);
    const paths = new Paths(sdk, photosSdk);
    return {
        account,
        sdk,
        photosSdk,
        sdkDiagnostic,
        paths,
    };
}

function initCrypto() {
    CryptoApi.init();
    return new CryptoApi();
}

function getConfig(): Config {
    return {
        appVersion: 'web-drive-sdk-cli@5.0.999.999',
        baseUrl: process.env.PROTON_DRIVE_BASE_URL || 'drive-api.proton.me',
        cacheDir: process.env.PROTON_DRIVE_CACHE_DIR || process.cwd(),
        enableConsoleLog: process.env.PROTON_DRIVE_DISABLE_CONSOLE_LOG === undefined,
    };
}

async function initAccount(cryptoApi: CryptoApi, config: Config) {
    const account = new Account(cryptoApi, config);
    await account.loadSession();
    return account;
}

async function initSrp(cryptoApi: CryptoApi, config: Config) {
    return new Srp(cryptoApi, config);
}

function initSDK(cryptoApi: CryptoApi, config: Config, account: Account, srp: Srp) {
    const { httpClient, entitiesCache, cryptoCache, telemetry, openPGPCryptoModule, latestEventIdProvider } =
        createSDKDependencies(config, account, cryptoApi);

    const sdk = new ProtonDriveClient({
        httpClient,
        entitiesCache,
        cryptoCache,
        config: {
            baseUrl: config.baseUrl,
            clientUid: 'proton-drive-sdk-js-cli-test',
        },
        telemetry,
        account,
        openPGPCryptoModule,
        srpModule: srp,
        latestEventIdProvider,
    });
    return sdk;
}

function initPhotosSDK(cryptoApi: CryptoApi, config: Config, account: Account, srp: Srp) {
    const { httpClient, entitiesCache, cryptoCache, telemetry, openPGPCryptoModule, latestEventIdProvider } =
        createSDKDependencies(config, account, cryptoApi);

    return new ProtonDrivePhotosClient({
        httpClient,
        entitiesCache,
        cryptoCache,
        config: {
            baseUrl: config.baseUrl,
            clientUid: 'proton-drive-photos-sdk-js-cli-test',
        },
        telemetry,
        account,
        openPGPCryptoModule,
        srpModule: srp,
        latestEventIdProvider,
    });
}

function initSDKDiagnostic(cryptoApi: CryptoApi, config: Config, account: Account, srp: Srp) {
    const { httpClient, openPGPCryptoModule } = createSDKDependencies(config, account, cryptoApi);

    return initDiagnostic({
        httpClient,
        config: { baseUrl: config.baseUrl },
        account,
        openPGPCryptoModule,
        srpModule: srp,
    });
}

function createSDKDependencies(config: Config, account: Account, cryptoApi: CryptoApi) {
    return {
        httpClient: new HTTPClient({
            ...config,
            uid: account.session?.uid || '',
            accessToken: account.session?.accessToken || '',
        }),
        entitiesCache: new SQLiteEntititesCache(config.cacheDir),
        cryptoCache: new MemoryCache<CachedCryptoMaterial>(),
        telemetry: initTelemetry(config.cacheDir, config.enableConsoleLog),
        openPGPCryptoModule: new OpenPGPCryptoWithCryptoProxy(cryptoApi),
        latestEventIdProvider: new NoLatestEventIdProvider(),
    };
}

class NoLatestEventIdProvider {
    getLatestEventId(): string | null {
        return null;
    }
}
