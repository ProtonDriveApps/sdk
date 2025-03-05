import { ParseArgsConfig } from "util";
import { Command, ActionArgs } from './interface';

export class CommandAuthLogout implements Command {
    group = 'auth';
    name = 'logout';
    isAuthAction = true;

    async action({ account }: ActionArgs) {
        await account.logout();
    }
}
