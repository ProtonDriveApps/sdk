import { ParseArgsConfig } from 'util';

import { Command, ActionArgs } from '../interface';
import { PUBLIC_OPTIONS } from './base';
import { printObject } from '../formatters';

export class CommandPublicScanHashes implements Command {
    group = 'public';
    name = 'scan-hashes';
    isPublicAction = true;
    args = ['hash'];
    options: ParseArgsConfig['options'] = PUBLIC_OPTIONS;

    async action({ paths, args, options: { json, url, 'custom-password': customPassword } }: ActionArgs) {
        if (args.length === 0) {
            throw new Error('At least one hash must be provided');
        }

        const client = await paths.authPublicLinkSession(url, customPassword);
        const result = await client.experimental.scanHashes(args);
        printObject(result, json);
    }
}
