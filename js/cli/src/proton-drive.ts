import { run } from './cli';
import { COMMANDS } from './commands';

const CLIENT_UID_PREFIX = 'sdk-js-cli';
// Two or three dash-separated parts: platform, product, optional section (e.g. sdkclijs not sdk-cli-js).
const APP_VERSION = 'external-drive-sdkclijs@0.0.1';

await run(COMMANDS, {
    clientUidPrefix: CLIENT_UID_PREFIX,
    appVersion: APP_VERSION,
    debug: false,
    enablePersistedEvents: true,
});

process.exit(0);
