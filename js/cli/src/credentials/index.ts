import { Logger } from '@protontech/drive-sdk';

import type { Config } from '../config';
import { Credentials } from './credentials';
import type { CredentialsStore } from './interface';
import { PlaintextFileSessionStore } from './fileCredentialsStore';
import { SecretsSessionStore } from './secretCredentialsStore';

export type { Credentials } from './credentials';

export function initCredentials(config: Config, logger: Logger): Credentials {
    const credentialsStore = createAuthSessionStore(config, logger);
    return new Credentials(credentialsStore, logger);
}

function createAuthSessionStore(config: Config, logger: Logger): CredentialsStore {
    if (config.unsafeSecrets) {
        return new PlaintextFileSessionStore(config.cacheDir, logger);
    }
    return new SecretsSessionStore(logger);
}
