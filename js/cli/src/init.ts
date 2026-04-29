import '@protontech/drive-sdk/polyfill';

import { CryptoProxy } from '@protontech/crypto';
import { Api as CryptoApi } from '@protontech/crypto/proxy/endpoint/api.ts';
import {
    CachedCryptoMaterial,
    FeatureFlags,
    Logger,
    MemoryCache,
    OpenPGPCryptoWithCryptoProxy,
    ProtonDriveClient,
} from '@protontech/drive-sdk';
import { initDiagnostic } from '@protontech/drive-sdk/diagnostic';
import { ProtonDrivePhotosClient } from '@protontech/drive-sdk/protonDrivePhotosClient';

import { initApi } from './api';
import { createEntitiesCache } from './cache';
import { Paths } from './cli';
import { getConfig, InitConfig } from './config';
import { initCredentials } from './credentials';
import { initTelemetry } from './telemetry';

function initOpenPGPCryptoModule() {
    CryptoApi.init({});
    CryptoProxy.setEndpoint(new CryptoApi(), endpoint => endpoint.clearKeyStore());
    return new OpenPGPCryptoWithCryptoProxy(CryptoProxy)
}

export async function init(configOptions: InitConfig) {
    const config = getConfig(configOptions);
    const telemetry = initTelemetry(config.cacheDir, config.enableConsoleLog);
    const logger = telemetry.getLogger('cli');

    const openPGPCryptoModule = initOpenPGPCryptoModule();
    const credentials = initCredentials(config, logger);
    const { auth, addresses, srp, httpClient } = await initApi(config, credentials, logger);

    const entitiesCache = createEntitiesCache(config, credentials, logger);
    const sdkDependencies = {
        config: {
            baseUrl: config.baseUrl,
            clientUid: config.clientUid,
        },
        httpClient,
        entitiesCache,
        cryptoCache: new MemoryCache<CachedCryptoMaterial>(),
        telemetry,
        openPGPCryptoModule,
        account: addresses,
        srpModule: srp,
        latestEventIdProvider: new NoLatestEventIdProvider(),
        featureFlagProvider: await FeatureFlagProvider.fromJsonFile(config.cacheDir + '/config.json'),
    };
    const sdk = new ProtonDriveClient(sdkDependencies);
    const photosSdk = new ProtonDrivePhotosClient(sdkDependencies);
    const sdkDiagnostic = initDiagnostic(sdkDependencies);

    const paths = new Paths(sdk, photosSdk, auth);

    return {
        logger: logger as Logger,
        auth,
        addresses,
        sdk,
        photosSdk,
        sdkDiagnostic,
        paths,
    };
}

class NoLatestEventIdProvider {
    async getLatestEventId(): Promise<string | null> {
        return null;
    }
}

class FeatureFlagProvider {
    constructor(private flags: Record<FeatureFlags, boolean>) {
        this.flags = flags;
    }

    static async fromJsonFile(jsonFile: string) {
        const file = Bun.file(jsonFile);

        if (!(await file.exists())) {
            return new FeatureFlagProvider({} as Record<FeatureFlags, boolean>);
        }

        const bytes = await file.bytes();
        const content = new TextDecoder().decode(bytes);
        const flags = JSON.parse(content) as Record<FeatureFlags, boolean>;
        return new FeatureFlagProvider(flags);
    }

    isEnabled(flagName: FeatureFlags): Promise<boolean> {
        return Promise.resolve(this.flags[flagName] ?? false);
    }
}
