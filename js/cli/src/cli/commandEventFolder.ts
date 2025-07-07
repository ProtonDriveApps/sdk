import { Command, ActionArgs } from "./interface";
import { runForever, eventsCallback } from "./events";

export class CommandEventFolder implements Command {
    group = "event";
    name = "folder";
    args = ["path"];

    async action({ sdk, paths, args: [pathString], options: { json } }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();

        // Consume the initial data to trigger the subscription.
        await Array.fromAsync(sdk.iterateFolderChildren(node));

        await sdk.subscribeToRemoteDataUpdates();
        sdk.subscribeToFolder(node, (event) => eventsCallback(json, event));
        await runForever();
    }
}
