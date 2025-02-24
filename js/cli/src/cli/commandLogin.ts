import { ParseArgsConfig } from "util";
import { Command, ActionArgs } from './interface';

export class CommandLogin implements Command {
    name = 'login';
    isAuthAction = true;
    options: ParseArgsConfig['options'] = {
        username: {
            type: 'string',
        },
        password: {
            type: 'string',
        },
    };

    async action({ account, options }: ActionArgs) {
        await account.auth(options.username, options.password);
        console.log("session:", account.session);
    }
}
