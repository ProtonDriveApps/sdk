import { ParseArgsConfig } from 'util';

import { printIterable } from '../formatters';
import { Command, ActionArgs } from '../interface';

export class CommandInvitationList implements Command {
    group = 'invitation';
    name = 'list';
    options: ParseArgsConfig['options'] = {
        photos: {
            type: 'boolean',
            short: 'p',
            default: false,
        },
    };

    async action({ sdk, photosSdk, options: { photos, json } }: ActionArgs) {
        if (photos) {
            await printIterable(photosSdk.iterateInvitations(), json);
        } else {
            await printIterable(sdk.iterateInvitations(), json);
        }
    }
}
