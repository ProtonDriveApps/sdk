import { Auth } from '../../api';
import { type ActionArgs, type Command, openBrowserUrl, sanitizeTerminalText } from '../../cli';

export class CommandAuthLogin implements Command {
    group = 'auth';
    name = 'login';
    isAuthAction = true;

    async action({ auth, eventsManager }: ActionArgs) {
        await this.handleAuthViaWeb(auth);
        await eventsManager.startSubscriptions();
    }

    protected async handleAuthViaWeb(auth: Auth) {
        return auth.authViaWeb((signInUrl) => {
            openBrowserUrl(signInUrl);
            console.log('Sign in in your browser (URL also printed if it did not open automatically):');
            console.log(sanitizeTerminalText(signInUrl));
        });
    }
}
