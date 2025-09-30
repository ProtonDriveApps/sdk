import { Command, ActionArgs } from './interface';
import { printObject } from './formatters';

export class CommandDeviceRename implements Command {
    group = 'device';
    name = 'rename';
    args = ['deviceUid', 'name'];

    async action({ sdk, args: [deviceUid, name], options: { json } }: ActionArgs) {
        const device = await sdk.renameDevice(deviceUid, name);
        printObject(device, json);
    }
}
