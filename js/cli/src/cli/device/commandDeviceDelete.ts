import { Command, ActionArgs } from '../interface';

export class CommandDeviceDelete implements Command {
    group = 'device';
    name = 'delete';
    args = ['deviceUid'];

    async action({ sdk, args: [deviceUid], options: { json } }: ActionArgs) {
        await sdk.deleteDevice(deviceUid);
        if (!json) {
            console.log(`Deleted device: ${deviceUid}`);
        }
    }
}
