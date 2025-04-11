import { Account } from "./account/account";
import { Api as CryptoApi } from "./crypto/lib/worker/api";
import { HTTPClient } from "./httpClient";
import { initTelemetry } from "./telemetry";
import { SQLiteEntititesCache } from "./cache";
import { Paths } from "./cli/paths";

import { ProtonDriveClient, MemoryCache, CachedCryptoMaterial, OpenPGPCryptoWithCryptoProxy, VERSION } from "../../sdk/src";

interface Config {
    appVersion: string;
    baseUrl: string;
    cacheDir: string;
    enableConsoleLog: boolean;
    uid?: string;
    accessToken?: string;
}

export async function init() {
    console.log(`Proton Drive SDK for web v${VERSION}`);
    const cryptoApi = initCrypto();
    const config = getConfig();
    const account = await initAccount(cryptoApi, config);
    const sdk = initSDK(cryptoApi, config, account);
    const paths = new Paths(sdk);
    return {
        account,
        sdk,
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
        baseUrl: process.env.DRIVE_SDK_BASE_URL || 'drive-api.proton.me',
        cacheDir: process.env.DRIVE_SDK_CACHE_DIR || process.cwd(),
        enableConsoleLog: process.env.DRIVE_SDK_DISABLE_CONSOLE_LOG === undefined,
    }
}

async function initAccount(cryptoApi: CryptoApi, config: Config) {
    const account = new Account(cryptoApi, config);
    await account.loadSession();
    return account;
}

function initSDK(cryptoApi: CryptoApi, config: Config, account: Account) {
    const httpClient = new HTTPClient({
        ...config,
        uid: account.session?.uid || "",
        accessToken: account.session?.accessToken || "",
    });
    const openPGPCryptoModule = new OpenPGPCryptoWithCryptoProxy(cryptoApi);

    const entitiesCache = new SQLiteEntititesCache(config.cacheDir);
    const cryptoCache = new MemoryCache<CachedCryptoMaterial>();

    const telemetry = initTelemetry(config.cacheDir, config.enableConsoleLog);

    const sdk = new ProtonDriveClient({
        httpClient,
        entitiesCache,
        cryptoCache,
        config: { baseUrl: config.baseUrl },
        telemetry,
        account,
        openPGPCryptoModule,
    });
    return sdk;
}
