import { ParseArgsConfig } from "util";
import { Command, ActionArgs } from "./interface";
import { runForever, eventsCallback } from "./events";

export class CommandEventTrash implements Command {
    group = "event";
    name = "trash";
    options: ParseArgsConfig['options'] = {
        json: {
            type: 'boolean',
            short: 'j',
            default: false,
        },
    };

    async action({ sdk, options: { json } }: ActionArgs) {
        // Consume the initial data to trigger the subscription.
        await Array.fromAsync(sdk.iterateTrashedNodes());

        await sdk.subscribeToRemoteDataUpdates();
        sdk.subscribeToTrashedNodes((event) => eventsCallback(json, event));
        await runForever();
    }
}
