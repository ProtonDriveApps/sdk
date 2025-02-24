import { Command, ActionArgs } from './interface';

export class CommandStat implements Command {
    name = 'stat';
    args = ['path'];

    async action({ paths, args: [ pathString ] }: ActionArgs) {
        const path = paths.getPath(pathString);
        const node = await path.getNode();
        console.log(node);
    }
}
