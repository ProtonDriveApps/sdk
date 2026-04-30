import { run } from './cli';
import { COMMANDS } from './commands';

const CLIENT_UID = 'proton-drive-sdk-js-cli';
// Two or three dash-separated parts: platform, product, optional section (e.g. sdkclijs not sdk-cli-js).
const APP_VERSION = 'external-drive-sdkclijs@1.0.0';

await run(COMMANDS, {
    clientUid: CLIENT_UID,
    appVersion: APP_VERSION,
    debug: false,
    enablePersistedEvents: true,
});

process.exit(0);
