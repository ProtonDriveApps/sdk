import { Command, ActionArgs } from '../interface';
import { runForever, eventsCallback, eventsReady } from '../events';

export class CommandEventsDrive implements Command {
    group = 'events';
    name = 'drive';

    async action({ sdk, options: { json } }: ActionArgs) {
        await sdk.subscribeToDriveEvents(async (event) => eventsCallback(json, () => true, event));
        eventsReady(json);
        await runForever();
    }
}
