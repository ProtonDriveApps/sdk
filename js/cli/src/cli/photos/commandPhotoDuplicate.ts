import path from 'node:path';

import { sha1 } from '@noble/hashes/sha1';

import { arrayToHexString } from '../../crypto/lib/utils';
import { printObject } from '../formatters';
import { Command, ActionArgs } from '../interface';

export class CommandPhotoDuplicate implements Command {
    group = 'photo';
    name = 'duplicate';
    args = ['localPath'];


    async action({ photosSdk, args: [localPath], options: { json } }: ActionArgs) {
        const name = path.basename(localPath);

        const getSha1 = async () => {
            const file = Bun.file(localPath);
            const fileBytes = await file.bytes();

            const sha1Instance = sha1.create();
            sha1Instance.update(fileBytes);
            const sha1Hash = sha1Instance.digest() as Uint8Array<ArrayBuffer>;

            return arrayToHexString(sha1Hash);
        }

        const isDuplicate = await photosSdk.isDuplicatePhoto(name, getSha1)
        printObject({ isDuplicate }, json);
    }
}
