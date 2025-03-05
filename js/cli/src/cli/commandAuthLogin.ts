import { ParseArgsConfig } from "util";
import { Command, ActionArgs } from './interface';

export class CommandAuthLogin implements Command {
    group = 'auth';
    name = 'login';
    isAuthAction = true;
    args = ['username'];
    options: ParseArgsConfig['options'] = {
        password: {
            type: 'string',
            default: '',
        },
    };

    async action({ account, args: [ username ], options: { password } }: ActionArgs) {
        if (!password) {
            console.log("Password:");
            // TODO hide password when typing
            for await (const line of console) {
                password = line.trim();
                break;
            }
        }
        await account.auth(username, password);
        console.log("session:", account.session);
    }
}
