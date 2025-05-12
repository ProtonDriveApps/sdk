import { Command, ActionArgs } from './interface';

export class CommandDeviceRename implements Command {
    group = 'device';
    name = 'rename';
    args = ['deviceUid', 'name'];

    async action({ sdk, args: [deviceUid, name], options: { json } }: ActionArgs) {
        const device = await sdk.renameDevice(deviceUid, name);
        if (json) {
            console.log(JSON.stringify(device));
        } else {
            console.log(device);
        }
    }
}