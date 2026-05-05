import { type ActionArgs, type Command } from '../../cli';

export class CommandAuthLogout implements Command {
    group = 'auth';
    name = 'logout';
    isAuthAction = true;

    async action({ auth, clearCaches }: ActionArgs) {
        await auth.logout();
        await clearCaches();
    }
}
