import { Auth } from '../../api';
import { type ActionArgs, type Command, openBrowserUrl, sanitizeTerminalText } from '../../cli';

export class CommandAuthLogin implements Command {
    group = 'auth';
    name = 'login';
    help = 'Opens a browser to sign in. Keep the terminal open until authentication completes.';
    isAuthAction = true;

    async action({ auth, eventsManager, options: { json } }: ActionArgs) {
        await this.handleAuthViaWeb(auth, json);
        if (!json) {
            console.log('Authentication successful');
        }
        await eventsManager.startSubscriptions();
    }

    protected async handleAuthViaWeb(auth: Auth, json: boolean) {
        return auth.authViaWeb((signInUrl) => {
            openBrowserUrl(signInUrl);
            if (json) {
                console.log(sanitizeTerminalText(JSON.stringify({ signInUrl })));
            } else {
                console.log(
                    'Sign in in your browser. Keep the terminal open. Waiting for authentication to complete...',
                );
                console.log('Open following URL manually if browser did not open automatically:');
                console.log(sanitizeTerminalText(signInUrl));
            }
        });
    }
}
