import { Command, ActionArgs } from './interface';
import { runForever, eventsCallback, eventsReady } from './events';
import { DriveEvent } from '../../../sdk/src';

export class CommandEventsMyVolume implements Command {
    group = 'events';
    name = 'my-volume';

    async action({ sdk, options: { json } }: ActionArgs) {
        const maybeNode = await sdk.getMyFilesRootFolder();
        if (!maybeNode.ok) {
            throw Error('My Files not found');
        }
        const node = maybeNode.value;
        const filter = () => true;
        await sdk.subscribeToTreeEvents(node.treeEventScopeId, async (event: DriveEvent) =>
            eventsCallback(json, filter, event),
        );
        eventsReady(json);
        await runForever();
    }
}
