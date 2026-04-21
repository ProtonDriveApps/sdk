import { Command, ActionArgs } from '../interface';

export class CommandAuthLogout implements Command {
    group = 'auth';
    name = 'logout';
    isAuthAction = true;

    async action({ auth }: ActionArgs) {
        await auth.logout();
    }
}
