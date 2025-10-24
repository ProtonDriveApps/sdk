import { ParseArgsConfig } from 'util';

import { Command, ActionArgs } from '../interface';
import { printObject } from '../formatters';

export class CommandDiagnosticTree implements Command {
    group = 'diagnostic';
    name = 'tree';
    args = ['path'];
    options: ParseArgsConfig['options'] = {
        content: {
            type: 'boolean',
            short: 'c',
            default: false,
        },
        thumbnails: {
            type: 'boolean',
            short: 't',
            default: false,
        },
        'local-structure': {
            type: 'string',
            short: 's',
            default: '',
        },
    };

    async action({
        sdkDiagnostic,
        paths,
        args: [pathString],
        options: { json, content, thumbnails, 'local-structure': localStructure },
    }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();

        const expectedStructure = localStructure ? JSON.parse(await Bun.file(localStructure).text()) : undefined;

        const options = {
            verifyContent: content,
            verifyThumbnails: thumbnails,
            expectedStructure,
        };

        for await (const result of sdkDiagnostic.verifyNodeTree(node, options, (progress) => {
            printObject(progress, json);
        })) {
            printObject(result, json);
        }
    }
}
