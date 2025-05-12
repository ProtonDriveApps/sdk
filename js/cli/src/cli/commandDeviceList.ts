import { Command, ActionArgs } from './interface';

export class CommandDeviceList implements Command {
    group = 'device';
    name = 'list';

    async action({ sdk, options: { json } }: ActionArgs) {
        for await (const device of sdk.iterateDevices()) {
            if (json) {
                console.log(JSON.stringify(device));
            } else {
                console.log(device);
            }
        }
    }
}