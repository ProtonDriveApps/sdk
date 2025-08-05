import { Command, ActionArgs } from './interface';
import { runForever, eventsCallback, eventsReady } from './events';
import { DriveEvent, DriveEventType } from '../../../sdk/src';

export class CommandEventsPath implements Command {
    group = 'events';
    name = 'path';
    args = ['path'];

    async action({ sdk, paths, args: [pathString], options: { json } }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const maybeNode = await nodePath.getNode();
        if (!maybeNode.ok) {
            throw Error('Folder not found');
        }
        const node = maybeNode.value;

        const filter = (event: DriveEvent) => {
            if (
                ![DriveEventType.NodeCreated, DriveEventType.NodeUpdated, DriveEventType.TreeRefresh].includes(
                    event.type,
                )
            ) {
                return false;
            }
            if ('parentNodeUid' in event) {
                // If node is deleted, parent uid may no longer exist, so better to return all deletions
                return event.parentNodeUid === node.uid || event.parentNodeUid === null;
            }
            return false;
        };

        await sdk.subscribeToTreeEvents(node.treeEventScopeId, async (event: DriveEvent) =>
            eventsCallback(json, filter, event),
        );
        eventsReady(json);
        await runForever();
    }
}
