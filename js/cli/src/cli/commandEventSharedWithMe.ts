import { ParseArgsConfig } from "util";
import { Command, ActionArgs } from "./interface";
import { runForever, eventsCallback } from "./events";

export class CommandEventSharedWithMe implements Command {
    group = "event";
    name = "shared-with-me";
    options: ParseArgsConfig['options'] = {
        json: {
            type: 'boolean',
            short: 'j',
            default: false,
        },
    };

    async action({ sdk, options: { json } }: ActionArgs) {
        // Consume the initial data to trigger the subscription.
        await Array.fromAsync(sdk.iterateSharedNodesWithMe());

        await sdk.subscribeToRemoteDataUpdates();
        sdk.subscribeToSharedNodesWithMe((event) => eventsCallback(json, event));
        await runForever();
    }
}
