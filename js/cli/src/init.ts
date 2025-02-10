import { Account } from "./account/account";
import { Api as CryptoApi } from "./crypto/lib/worker/api";
import { HTTPClient } from "./httpClient";
import { getLogger } from "./logger";
import { FileSystem } from "./fileSystem";

import { CACHE_TAG_KEYS, ProtonDriveClient, MemoryCache, CachedCryptoMaterial, OpenPGPCryptoWithCryptoProxy } from "../../sdk/src";

interface APIConfig {
    appVersion: string;
    baseUrl: string;
    uid?: string;
    accessToken?: string;
}

export async function init() {
    const cryptoApi = initCrypto();
    const config = getAPIConfig();
    const account = await initAccount(cryptoApi, config);
    const sdk = initSDK(cryptoApi, config, account);
    const fileSystem = new FileSystem(sdk);
    return {
        account,
        sdk,
        fileSystem,
    };
}

function initCrypto() {
    CryptoApi.init();
    return new CryptoApi();
}

function getAPIConfig(): APIConfig {
    return {
        appVersion: 'web-drive-sdk-cli@5.0.999.999',
        baseUrl: process.env.DRIVE_SDK_BASE_URL || 'drive.proton.me',
    }
}

async function initAccount(cryptoApi: CryptoApi, config: APIConfig) {
    const account = new Account(cryptoApi, config);
    await account.loadSession();
    return account;
}

function initSDK(cryptoApi: CryptoApi, config: APIConfig, account: Account) {
    const httpClient = new HTTPClient({
        ...config,
        uid: account.session?.uid || "",
        accessToken: account.session?.accessToken || "",
    });
    const openPGPCryptoModule = new OpenPGPCryptoWithCryptoProxy(cryptoApi);

    const entitiesCache = new MemoryCache<string>(CACHE_TAG_KEYS);
    const cryptoCache = new MemoryCache<CachedCryptoMaterial>([]);

    const sdk = new ProtonDriveClient({
        httpClient,
        entitiesCache,
        cryptoCache,
        account,
        openPGPCryptoModule,
        acceptNoGuaranteeWithCustomModules: true,
        getLogger,
    });
    return sdk;
}
