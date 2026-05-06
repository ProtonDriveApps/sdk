import { Logger } from '@protontech/drive-sdk';

import type { Config } from '../config';
import { Credentials } from './credentials';
import { PlaintextFileSessionStore } from './fileCredentialsStore';
import type { CredentialsStore } from './interface';
import { SecretsSessionStore } from './secretCredentialsStore';

export type { Credentials } from './credentials';

export function initCredentials(config: Config, logger: Logger): Credentials {
    const credentialsStore = createAuthSessionStore(config, logger);
    return new Credentials(credentialsStore, logger);
}

function createAuthSessionStore(config: Config, logger: Logger): CredentialsStore {
    if (config.unsafeSecrets) {
        return new PlaintextFileSessionStore(config.appDir, logger);
    }
    return new SecretsSessionStore(logger);
}
