import { type ActionArgs, type Command } from '../../cli';

export class CommandAuthLogout implements Command {
    group = 'auth';
    name = 'logout';
    help = 'Signs out and clears local credentials and caches.';
    isAuthAction = true;

    async action({ auth, clearCaches }: ActionArgs) {
        await auth.logout();
        await clearCaches();
    }
}
