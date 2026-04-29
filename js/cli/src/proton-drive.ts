import { FeatureFlags } from '@protontech/drive-sdk';

import { run } from './cli';
import { COMMANDS } from './commands';

// Two or three dash-separated parts: platform, product, optional section (e.g. sdkclijs not sdk-cli-js).
declare const APP_VERSION: string;
declare const SDK_VERSION: string | undefined;

const CLIENT_UID_PREFIX = 'sdk-js-cli';

(async () => {
    await run(COMMANDS, {
        clientUidPrefix: CLIENT_UID_PREFIX,
        appVersion: APP_VERSION,
        sdkVersion: SDK_VERSION,
        enablePersistedEvents: true,
        debug: false,
        // TODO: Configure flags via Unleash.
        flags: {
            [FeatureFlags.DriveCryptoEncryptBlocksWithPgpAead]: true,
            [FeatureFlags.DriveSmallFileUpload]: true,
        },
    });
    process.exit(0);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
