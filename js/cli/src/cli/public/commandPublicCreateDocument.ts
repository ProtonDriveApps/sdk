import { ParseArgsConfig } from 'util';

import { printObject } from '../formatters';
import { Command, ActionArgs } from '../interface';
import { PUBLIC_OPTIONS } from './base';

export class CommandPublicCreateDocument implements Command {
    group = 'public';
    name = 'create-document';
    isPublicAction = true;
    args = ['path', 'name'];
    options: ParseArgsConfig['options'] = {
        ...PUBLIC_OPTIONS,
        type: {
            type: 'string',
            short: 't',
            default: 'docs',
        },
    };

    async action({
        paths,
        args: [pathString, name],
        options: { json, url, 'custom-password': customPassword, type },
    }: ActionArgs) {
        const client = await paths.authPublicLinkSession(url, customPassword);
        const nodePath = paths.getPublicLinkPath(pathString);
        const parent = await nodePath.getNode();

        const documentType = type === 'docs' ? 1 : 2;
        const document = await client.experimental.createDocument(parent, name, documentType);

        printObject(document, json);
    }
}
