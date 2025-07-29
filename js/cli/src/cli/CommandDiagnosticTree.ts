import { ParseArgsConfig } from 'util';

import { Command, ActionArgs } from './interface';

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
        localStructure: {
            type: 'string',
            short: 's',
            default: '',
        },
    };

    async action({ sdkDiagnostic, paths, args: [pathString], options: { json, content, thumbnails } }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();

        const options = {
            verifyContent: content,
            verifyThumbnails: thumbnails,
        };

        for await (const result of sdkDiagnostic.verifyNodeTree(node, options)) {
            if (json) {
                console.log(JSON.stringify(result));
            } else {
                console.log(result);
            }
        }
    }
}
