import { Command, ActionArgs } from "./interface";
import { runForever, eventsCallback } from "./events";

export class CommandEventsDrive implements Command {
    group = "events";
    name = "drive";

    async action({ sdk, options: { json } }: ActionArgs) {
        await sdk.subscribeToDriveEvents(async (event) => eventsCallback(json, () => true, event));
        await runForever();
    }
}
