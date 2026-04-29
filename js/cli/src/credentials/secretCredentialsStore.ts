import { Logger } from '@protontech/drive-sdk';

import type { Credentials, CredentialsStore } from './interface';
import { parseStoredSnapshot } from './parseCredentials';

const SECRET_SERVICE = 'ch.proton.drive/drive-sdk-cli';
const SECRET_NAME = 'auth-session';

export class SecretsSessionStore implements CredentialsStore {
    constructor(private readonly logger: Logger) {}

    async load(): Promise<Credentials | null> {
        this.logger.debug(`Loading session ${SECRET_NAME} from secrets`);
        const raw =
            (await Bun.secrets.get({ service: SECRET_SERVICE, name: SECRET_NAME })) as string | null;
        return parseStoredSnapshot(raw);
    }

    async save(snapshot: Credentials): Promise<void> {
        this.logger.debug(`Saving session ${SECRET_NAME} to secrets`);
        await Bun.secrets.set({
            service: SECRET_SERVICE,
            name: SECRET_NAME,
            value: JSON.stringify(snapshot),
        });
    }

    async remove(): Promise<void> {
        this.logger.debug(`Removing session ${SECRET_NAME} from secrets`);
        await Bun.secrets.delete({ service: SECRET_SERVICE, name: SECRET_NAME });
    }
}
