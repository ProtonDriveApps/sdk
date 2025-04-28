import { Command, ActionArgs } from "./interface";
import { runForever } from "./events";

export class CommandEventSync implements Command {
    group = "event";
    name = "sync";

    async action({ sdk }: ActionArgs) {
        await sdk.subscribeToRemoteDataUpdates();
        await runForever();
    }
}
