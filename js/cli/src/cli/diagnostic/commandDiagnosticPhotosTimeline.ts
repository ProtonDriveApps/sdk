import { ParseArgsConfig } from 'util';

import { Command, ActionArgs } from '../interface';
import { printObject } from '../formatters';

export class CommandDiagnosticPhotosTimeline implements Command {
    group = 'diagnostic';
    name = 'photos-timeline';
    options: ParseArgsConfig['options'] = {
        content: {
            type: 'boolean',
            short: 'c',
            default: false,
        },
        'content-peak': {
            type: 'boolean',
            short: 'p',
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
        options: { json, content, 'content-peak': contentPeak, thumbnails, 'local-structure': localStructure },
    }: ActionArgs) {
        const expectedStructure = localStructure ? JSON.parse(await Bun.file(localStructure).text()) : undefined;

        const options = {
            verifyContent: contentPeak ? 'peakOnly' : content,
            verifyThumbnails: thumbnails,
            expectedStructure,
        };

        for await (const result of sdkDiagnostic.verifyPhotosTimeline(options, (progress) => {
            printObject(progress, json);
        })) {
            printObject(result, json);
        }
    }
}
