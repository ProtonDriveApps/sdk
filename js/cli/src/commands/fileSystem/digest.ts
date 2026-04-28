import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export async function getSha1(localPath: string): Promise<string> {
    const hash = createHash('sha1');
    for await (const chunk of createReadStream(localPath)) {
        hash.update(chunk as Buffer);
    }
    return hash.digest('hex');
}
