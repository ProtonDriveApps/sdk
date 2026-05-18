import { FeatureFlags } from '@protontech/drive-sdk';

import { run } from './cli';
import { COMMANDS } from './commands';
import { captureException, flushSentry, initSentry } from './sentry';

// Two or three dash-separated parts: platform, product, optional section (e.g. sdkclijs not sdk-cli-js).
declare const APP_VERSION: string;
declare const SDK_VERSION: string | undefined;
declare const SENTRY_DSN: string | undefined;

const CLIENT_UID_PREFIX = 'sdk-js-cli';

initSentry({ dsn: SENTRY_DSN, appVersion: APP_VERSION, sdkVersion: SDK_VERSION });

try {
    await run(COMMANDS, {
        clientUidPrefix: CLIENT_UID_PREFIX,
        appVersion: APP_VERSION,
        sdkVersion: SDK_VERSION,
        enablePersistedEvents: true,
        // TODO: Configure flags via Unleash.
        flags: {
            [FeatureFlags.DriveCryptoEncryptBlocksWithPgpAead]: true,
            [FeatureFlags.DriveSmallFileUpload]: true,
        },
    });
    process.exit(0);
} catch (error: unknown) {
    console.error(error);
    captureException(error);
    await flushSentry();
    process.exit(1);
}
