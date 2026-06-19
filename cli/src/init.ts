import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { CryptoProxy } from '@protontech/crypto';
import { Api as CryptoApi } from '@protontech/crypto/proxy/endpoint/api.ts';
import { FeatureFlags, Logger, OpenPGPCryptoWithCryptoProxy, ProtonDriveClient } from '@protontech/drive-sdk';
import { initDiagnostic } from '@protontech/drive-sdk/diagnostic';
import { ProtonDrivePhotosClient } from '@protontech/drive-sdk/protonDrivePhotosClient';

import { initApi } from './api';
import { createCaches } from './cache';
import { Paths } from './cli';
import { getOrGenerateClientUid } from './clientUid';
import { getConfig, InitConfig } from './config';
import { initCredentials } from './credentials';
import { Manager, NoEventsProvider, PersistedEventsProvider } from './events';
import { initTelemetry } from './telemetry';

export async function init(configOptions: InitConfig) {
    const config = getConfig(configOptions);
    await Promise.all([
        mkdir(config.cacheDir, { recursive: true }),
        mkdir(config.appDir, { recursive: true }),
        mkdir(config.logDir, { recursive: true }),
    ]);

    const { telemetry, metrics, initMetrics, flush: flushTelemetry } = initTelemetry(config);
    const logger = telemetry.getLogger('cli');

    const openPGPCryptoModule = initOpenPGPCryptoModule();
    const credentials = initCredentials(config, logger);
    const { auth, addresses, srp, httpClient, apiClient } = await initApi(config, credentials, logger);

    // TODO: Once we have Account SDK, get the user plan from the auth object.
    initMetrics(apiClient, 'unknown');

    const clientUid = await getOrGenerateClientUid(config, logger);
    const caches = createCaches(config, credentials, logger);
    const eventsProvider = config.enablePersistedEvents
        ? await PersistedEventsProvider.open(logger, config.appDir)
        : new NoEventsProvider();

    const sdkDependencies = {
        config: {
            baseUrl: config.baseUrl,
            clientUid,
        },
        httpClient,
        entitiesCache: caches.entitiesCache,
        cryptoCache: caches.cryptoCache,
        telemetry,
        openPGPCryptoModule,
        account: addresses,
        srpModule: srp,
        latestEventIdProvider: eventsProvider,
        featureFlagProvider: configOptions.flags
            ? new FeatureFlagProvider(configOptions.flags)
            : await FeatureFlagProvider.fromJsonFile(path.join(config.appDir, 'config.json')),
    };
    const sdk = new ProtonDriveClient(sdkDependencies);
    const photosSdk = new ProtonDrivePhotosClient(sdkDependencies);
    const sdkDiagnostic = initDiagnostic(sdkDependencies);

    const eventsManager = await Manager.create(logger, sdk, photosSdk, eventsProvider, auth.isLoggedIn());

    const paths = new Paths(sdk, photosSdk, auth, eventsManager);

    return {
        logger: logger as Logger,
        auth,
        addresses,
        sdk,
        photosSdk,
        sdkDiagnostic,
        paths,
        eventsManager,
        eventsProvider,
        metrics,
        dispose: async () => {
            await Promise.all([flushTelemetry(), eventsManager.dispose()]);
        },
        clearCaches: async () => {
            logger.debug('Clearing caches');
            await Promise.allSettled([eventsManager.clear(), caches.cryptoCache.clear(), caches.entitiesCache.clear()]);
        },
    };
}

function initOpenPGPCryptoModule() {
    CryptoApi.init({});
    CryptoProxy.setEndpoint(new CryptoApi(), (endpoint) => endpoint.clearKeyStore());
    return new OpenPGPCryptoWithCryptoProxy(CryptoProxy);
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
