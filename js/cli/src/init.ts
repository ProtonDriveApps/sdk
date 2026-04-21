import {
    ProtonDriveClient,
    MemoryCache,
    CachedCryptoMaterial,
    OpenPGPCryptoWithCryptoProxy,
    OpenPGPCryptoProxy,
    FeatureFlags,
} from '../../sdk/src';
import { ProtonDrivePhotosClient } from '../../sdk/src/protonDrivePhotosClient';
import { initDiagnostic } from '../../sdk/src/diagnostic';

import { initApi } from './api';
import { createEntitiesCache } from './cache';
import { getConfig } from './config';
import { initCredentials } from './credentials';
import { Paths } from './cli/paths';
import { Api as CryptoApi } from './crypto/lib/worker/api';
import { initTelemetry } from './telemetry';

export async function init(debug: boolean) {
    const config = getConfig(debug);
    const telemetry = initTelemetry(config.cacheDir, config.enableConsoleLog);
    const logger = telemetry.getLogger('cli');

    const cryptoApi = initCrypto();
    const credentials = initCredentials(config, logger);
    const { auth, addresses, srp, httpClient } = await initApi(config, cryptoApi, credentials, logger);

    const entitiesCache = createEntitiesCache(config, credentials, logger);
    const sdkDependencies = {
        config: {
            baseUrl: config.baseUrl,
            clientUid: 'proton-drive-sdk-js-cli-test',
        },
        httpClient,
        entitiesCache,
        cryptoCache: new MemoryCache<CachedCryptoMaterial>(),
        telemetry,
        openPGPCryptoModule: new OpenPGPCryptoWithCryptoProxy(cryptoApi as OpenPGPCryptoProxy),
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
        auth,
        addresses,
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
