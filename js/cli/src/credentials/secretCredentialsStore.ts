import { Logger } from '../../../sdk/src';
import type { Credentials, CredentialsStore } from './interface';
import { parseStoredSnapshot } from './parseCredentials';

const SECRET_SERVICE = 'ch.proton.drive-sdk-cli';
const SECRET_NAME = 'auth-session';

export class SecretsSessionStore implements CredentialsStore {
    constructor(private readonly logger: Logger) {}

    async load(): Promise<Credentials | null> {
        this.logger.debug(`Loading session ${SECRET_NAME} from secrets`);
        const raw =
            // @ts-expect-error: Bun.secrets is not typed.
            (await Bun.secrets.get({ service: SECRET_SERVICE, name: SECRET_NAME })) as string | null;
        return parseStoredSnapshot(raw);
    }

    async save(snapshot: Credentials): Promise<void> {
        this.logger.debug(`Saving session ${SECRET_NAME} to secrets`);
        // @ts-expect-error: Bun.secrets is not typed.
        await Bun.secrets.set({
            service: SECRET_SERVICE,
            name: SECRET_NAME,
            value: JSON.stringify(snapshot),
        });
    }

    async remove(): Promise<void> {
        this.logger.debug(`Removing session ${SECRET_NAME} from secrets`);
        // @ts-expect-error: Bun.secrets is not typed.
        await Bun.secrets.delete({ service: SECRET_SERVICE, name: SECRET_NAME });
    }
}
