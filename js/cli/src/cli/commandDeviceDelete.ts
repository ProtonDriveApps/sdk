import { Command, ActionArgs } from './interface';

export class CommandDeviceDelete implements Command {
    group = 'device';
    name = 'delete';
    args = ['deviceUid'];

    async action({ sdk, args: [deviceUid] }: ActionArgs) {
        await sdk.deleteDevice(deviceUid);
        console.log(`Deleted device: ${deviceUid}`);
    }
}
