import { Account } from './account/account';
import { Srp } from './account/srp';
import { SQLiteEntititesCache } from './cache';
import { Paths } from './cli/paths';
import { Api as CryptoApi } from './crypto/lib/worker/api';
import { HTTPClient } from './httpClient';
import { initTelemetry } from './telemetry';

import {
    ProtonDriveClient,
    MemoryCache,
    CachedCryptoMaterial,
    OpenPGPCryptoWithCryptoProxy,
    MetricEvent,
    Logger,
} from '../../sdk/src';
import { Telemetry } from '../../sdk/src/telemetry';
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

export async function init(debug: boolean) {
    const cryptoApi = initCrypto();
    const config = getConfig(debug);
    const telemetry = initTelemetry(config.cacheDir, config.enableConsoleLog);
    const account = await initAccount(cryptoApi, config, telemetry.getLogger('account'));
    const srp = await initSrp(cryptoApi, config);
    const sdk = initSDK(cryptoApi, config, account, srp, telemetry);
    const photosSdk = initPhotosSDK(cryptoApi, config, account, srp, telemetry);
    const sdkDiagnostic = initSDKDiagnostic(cryptoApi, config, account, srp);
    const paths = new Paths(sdk, photosSdk, account);
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

function getConfig(debug: boolean): Config {
    return {
        // App version must have two or three parts, no more or less, separated by dash.
        // First part is platform name, second is product name, third is optional section.
        // That's why we have sdkclijs instead of sdk-cli-js.
        appVersion: 'external-drive-sdkclijs@5.0.999.999',
        baseUrl: process.env.PROTON_DRIVE_BASE_URL || 'drive-api.proton.me',
        cacheDir: process.env.PROTON_DRIVE_CACHE_DIR || process.cwd(),
        enableConsoleLog: debug,
    };
}

async function initAccount(cryptoApi: CryptoApi, config: Config, logger: Logger) {
    const account = new Account(cryptoApi, config, logger);
    await account.loadSession();
    return account;
}

async function initSrp(cryptoApi: CryptoApi, config: Config) {
    return new Srp(cryptoApi, config);
}

function initSDK(cryptoApi: CryptoApi, config: Config, account: Account, srp: Srp, telemetry: Telemetry<MetricEvent>) {
    const { httpClient, entitiesCache, cryptoCache, openPGPCryptoModule, latestEventIdProvider } =
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

function initPhotosSDK(
    cryptoApi: CryptoApi,
    config: Config,
    account: Account,
    srp: Srp,
    telemetry: Telemetry<MetricEvent>,
) {
    const { httpClient, entitiesCache, cryptoCache, openPGPCryptoModule, latestEventIdProvider } =
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
        openPGPCryptoModule: new OpenPGPCryptoWithCryptoProxy(cryptoApi),
        latestEventIdProvider: new NoLatestEventIdProvider(),
    };
}

class NoLatestEventIdProvider {
    getLatestEventId(): string | null {
        return null;
    }
}
