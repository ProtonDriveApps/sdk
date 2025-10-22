import { ParseArgsConfig } from 'util';

import { printObject } from '../formatters';
import { Command, ActionArgs } from '../interface';

export class CommandDeviceCreate implements Command {
    group = 'device';
    name = 'create';
    args = ['name'];
    options: ParseArgsConfig['options'] = {
        type: {
            type: 'string',
            short: 't',
        },
    };

    async action({ sdk, args: [name], options: { type, json } }: ActionArgs) {
        const device = await sdk.createDevice(name, type);
        printObject(device, json);
    }
}
