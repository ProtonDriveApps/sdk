import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { Logger } from '@protontech/drive-sdk/interface/telemetry';

import type { Config } from './config';

const CLIENT_UID_FILE = 'clientUid.json';

interface ClientUidFile {
    clientUid: string;
}

/**
 * Returns a persistent client UID for this machine and CLI variant (`prefix`)
 * stored as plain JSON in cache directory.
 */
export async function getOrGenerateClientUid(config: Config, logger: Logger): Promise<string> {
    const path = join(config.appDir, CLIENT_UID_FILE);
    const file = Bun.file(path);

    if (await file.exists()) {
        try {
            const data = JSON.parse(await file.text()) as ClientUidFile;
            if (typeof data.clientUid === 'string' && data.clientUid.startsWith(expectedUidPrefix(config.clientUidPrefix))) {
                logger.debug(`Using client UID: ${data.clientUid}`);
                return data.clientUid;
            }
        } catch (error: unknown) {
            logger.error(`Failed to load client UID`, error);
        }
    }

    const clientUid = `${config.clientUidPrefix}-${crypto.randomUUID()}`;
    await mkdir(config.appDir, { recursive: true });
    const payload: ClientUidFile = { clientUid };
    await Bun.write(path, `${JSON.stringify(payload, null, 2)}\n`);

    logger.info(`Generated new client UID: ${clientUid}`);
    return clientUid;
}

function expectedUidPrefix(prefix: string): string {
    return `${prefix}-`;
}
