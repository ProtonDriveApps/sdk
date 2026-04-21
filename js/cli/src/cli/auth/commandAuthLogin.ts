import { ParseArgsConfig } from 'util';

import { printObject } from '../formatters';
import { Command, ActionArgs } from '../interface';
import { readPasswordLine } from '../readPasswordLine';
import { openBrowserUrl } from '../openBrowserUrl';

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
        web: {
            type: 'boolean',
            default: false,
        },
    };

    async action({ auth, args: [username], options: { password, web, json } }: ActionArgs) {
        if (web) {
            const session = await auth.authViaWeb((signInUrl) => {
                openBrowserUrl(signInUrl);
                console.log('Sign in in your browser (URL also printed if it did not open automatically):');
                console.log(signInUrl);
            });
            printObject(session, json);
        } else {
            if (!password) {
                password = await readPasswordLine('Password: ');
            }

            const session = await auth.authViaPassword(username, password);
            printObject(session, json);
        }
    }
}
