import { Command, ActionArgs } from "./interface";
import { runForever, eventsCallback } from "./events";

export class CommandEventSharedByMe implements Command {
    group = "event";
    name = "shared-by-me";

    async action({ sdk, options: { json } }: ActionArgs) {
        // Consume the initial data to trigger the subscription.
        await Array.fromAsync(sdk.iterateSharedNodes());

        await sdk.subscribeToRemoteDataUpdates();
        sdk.subscribeToSharedNodesByMe((event) => eventsCallback(json, event));
        await runForever();
    }
}
